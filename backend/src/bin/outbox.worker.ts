import { initializeSentry, captureException } from '../shared/services/sentry.service';
import { appConfig } from '../config/app.config';
import { connectDB } from '../infrastructure/database/sequelize';
import { OutboxProcessor } from '../infrastructure/events/outbox.processor';
import { logger } from '../core/logger/logger';
import '../infrastructure/queue/workers';

// Ensure module side-effects register event listeners
import '../modules/auth/auth.events';
import '../modules/visits/visit.events';

const POLL_INTERVAL_MS = appConfig.outbox.pollIntervalMs;

let running = true;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const start = async () => {
  try {
    initializeSentry();
    await connectDB();

    logger.info({ interval: POLL_INTERVAL_MS }, 'Outbox worker connected to DB, starting sweep loop');

    while (running) {
      try {
        await OutboxProcessor.processPendingEvents();
      } catch (err: any) {
        logger.error({ err }, 'Outbox worker sweep failure');
        captureException(err, { module: 'outbox-worker', action: 'processPendingEvents' });
      }

      await sleep(POLL_INTERVAL_MS);
    }

    logger.info('Outbox worker shutting down gracefully.');
    process.exit(0);
  } catch (err) {
    logger.fatal({ err }, 'Outbox worker failed to start, exiting.');
    captureException(err, { module: 'outbox-worker', action: 'start' });
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  logger.info('SIGINT received. Stopping outbox worker...');
  running = false;
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Stopping outbox worker...');
  running = false;
});

start();
