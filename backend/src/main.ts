import fs from 'fs';
import http from 'http';
import https from 'https';
import app from './app';
import { appConfig } from './config/app.config';
import { assertProductionRuntimeRequirements } from './config/runtime-requirements';
import { connectDB, closeDB } from './infrastructure/database/sequelize';
import { redisClient } from './infrastructure/cache/redis.client';
import { logger } from './core/logger/logger';
import { initializeSocket } from './infrastructure/websocket/socket';
import { initializeGateway } from './infrastructure/websocket/gateway';
import { OutboxProcessor } from './infrastructure/events/outbox.processor';
import { captureException, initializeSentry } from './shared/services/sentry.service';
import { validateSendGridFromEmail } from './shared/services/sendgrid.service';
import { UniFiAccessPollerService } from './modules/unifi-webhooks/unifi-access-poller.service';
import { DetectStaleVisitsInteractor } from './modules/visits/use-cases/DetectStaleVisitsInteractor';
import './modules/auth/auth.events';
import './modules/visits/visit.events';

const PORT = appConfig.port || 4000;
const HOST = appConfig.host;

const loadWorkerBootstrap = async () => {
  if (__filename.endsWith('.ts')) {
    require('./infrastructure/queue/workers/index.ts');
    return;
  }

  await import('./infrastructure/queue/workers/index.js');
};

const formatBoundHost = () => {
  if (HOST === '0.0.0.0') {
    return 'localhost';
  }

  return HOST;
};

const startServer = async () => {
  try {
    initializeSentry();

    // Non-blocking SendGrid sender sanity check (sandbox-mode). Logs and reports to Sentry; does not stop boot.
    validateSendGridFromEmail()
      .then((valid) => {
        if (!valid) {
          logger.warn(
            { module: 'email', provider: 'sendgrid', from: appConfig.sendgrid.fromEmail },
            `SendGrid sender validation failed for ${appConfig.sendgrid.fromEmail}; email deliveries may be blocked (403). See https://sendgrid.com/docs/for-developers/sending-email/sender-identity/`
          );
        }
      })
      .catch((err) => {
        logger.warn({ err, module: 'email', provider: 'sendgrid' }, 'SendGrid validation check errored unexpectedly');
      });
    assertProductionRuntimeRequirements();

    if (appConfig.background.queueWorkersEnabled) {
      logger.info('BullMQ workers enabled in API process');
      const { startWorkers } = require('./infrastructure/queue/workers/index');
      startWorkers().catch((err: any) => logger.error({ err }, 'Worker bootstrap failed'));
    } else {
      logger.info('BullMQ workers disabled in API process');
    }

    // 1. Establish core persistence layer
    await connectDB();

    // 2. HTTP/S Base attach
    const server = appConfig.https.enabled
      ? https.createServer(
          {
            pfx: appConfig.https.pfxPath ? fs.readFileSync(appConfig.https.pfxPath) : undefined,
            passphrase: appConfig.https.passphrase,
          },
          app
        )
      : http.createServer(app);

    // 3. Attach Stateful network layer (WebSockets API)
    initializeSocket(server);
    initializeGateway();

    // 4. Start listening
    server.on('error', (error) => {
      logger.fatal({ err: error, host: HOST, port: PORT, module: 'server', action: 'listen' }, 'HTTP server failed to bind');
      captureException(error, { module: 'server', action: 'listen', host: HOST, port: PORT });
      process.exit(1);
    });

    server.listen(PORT, HOST, () => {
      const protocol = appConfig.https.enabled ? 'https' : 'http';
      const publicHost = formatBoundHost();
      const baseUrl = `${protocol}://${publicHost}:${PORT}`;
      const apiBaseUrl = `${baseUrl}${appConfig.api.basePath}`;
      const docsUrl = `${baseUrl}/api-docs`;
      const socketUrl = `${baseUrl}${appConfig.socket.path}`;

      logger.info(`GMS Enterprise API operating successfully on ${baseUrl}`);
      logger.info(`Environment: ${appConfig.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
      logger.info({ url: apiBaseUrl }, 'API base URL');
      logger.info({ url: socketUrl }, 'Socket path URL');
      logger.info({ url: appConfig.clientUrl }, 'Configured frontend/client URL');
      logger.info(
        { url: appConfig.docs.enabled ? docsUrl : 'disabled' },
        appConfig.docs.enabled ? 'API docs URL' : 'API docs disabled'
      );
    });

    // 5. Initialize background resilient handlers (Cron, Outbox, Intelligence)
    const outboxInterval = appConfig.background.outboxPollingEnabled
      ? setInterval(() => {
          OutboxProcessor.processPendingEvents().catch((error) => {
            logger.error({ err: error, module: 'outbox', action: 'processPendingEvents' }, 'Outbox processor failed');
            captureException(error, { module: 'outbox', action: 'processPendingEvents' });
          });
        }, appConfig.outbox.pollIntervalMs)
      : null;

    // The 'SLA Heartbeat' - Sweep for stale visits in the lobby
    const staleVisitInterval = setInterval(() => {
      new DetectStaleVisitsInteractor().execute().catch((err: Error) => {
        logger.error({ err, module: 'intelligence', action: 'detectStaleVisits' }, 'SLA Heartbeat failed');
      });
    }, 5 * 60 * 1000); // 5-minute heartbeat

    if (outboxInterval) {
      logger.info({ intervalMs: appConfig.outbox.pollIntervalMs }, 'Outbox polling enabled in API process');
    } else {
      logger.info('Outbox polling disabled in API process');
    }

    const unifiAccessPoller = appConfig.background.unifiAccessPollingEnabled
      ? new UniFiAccessPollerService(appConfig.unifiAccess.pollIntervalMs)
      : null;

    if (unifiAccessPoller) {
      unifiAccessPoller.start();
    } else {
      logger.info('UniFi Access polling disabled in API process');
    }

    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info({ signal }, 'Shutdown signal received. Starting graceful termination sequence...');
      
      if (outboxInterval) clearInterval(outboxInterval);
      if (staleVisitInterval) clearInterval(staleVisitInterval);
      
      // 1. Stop External Pollers
      if (unifiAccessPoller) {
        unifiAccessPoller.stop();
        logger.info('UniFi poller stopped.');
      }

      // 2. Stop accepting new HTTP requests
      server.close(async () => {
        logger.info('HTTP server stopped. Draining resources...');

        try {
          // 3. Gracefully shutdown workers (BullMQ)
          const { closeWorkers } = await import('./infrastructure/queue/workers/index.js');
          await closeWorkers();
          logger.info('Background workers paused and closed.');

          // 4. Close core infrastructure connections
          await closeDB();
          
          if (redisClient) {
            await redisClient.quit();
            logger.info('Redis connection closed.');
          }

          logger.info('GMS Enterprise API shutdown complete. Farewell.');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during graceful shutdown sequence');
          process.exit(1);
        }
      });

      // Emergency force kill after 30 seconds
      setTimeout(() => {
        logger.fatal('Shutdown timed out. Force killing process.');
        process.exit(1);
      }, 30000);
    };

    // Graceful Shutdown hooks
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error({ err: reason, module: 'process', action: 'unhandledRejection' }, 'Unhandled promise rejection');
      captureException(reason, { module: 'process', action: 'unhandledRejection' });
    });

    process.on('uncaughtException', (error) => {
      logger.fatal({ err: error, module: 'process', action: 'uncaughtException' }, 'Uncaught exception');
      captureException(error, { module: 'process', action: 'uncaughtException' });
      process.exit(1);
    });
  } catch (error) {
    logger.fatal(
      {
        err: error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'CRITICAL: Failed to bootstrap enterprise application. Terminating.'
    );
    process.exit(1);
  }
};

startServer();
