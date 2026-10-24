import pino from 'pino';
import { appConfig } from '../../config/app.config';
import { getRequestId } from '../utils/cls';
import path from 'path';
import fs from 'fs';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Development: Use synchronous pretty-printing to ensure logs aren't lost during crashes.
// Production: Use asynchronous transport for performance.
const loggerOptions: pino.LoggerOptions = {
  level: appConfig.isProduction ? 'info' : 'debug',
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'secret', '*.secret', 'otp', '*.otp', 'apiKey', '*.apiKey'],
    remove: true,
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'gms-backend',
    env: appConfig.env,
  },
};

// pino-roll rotates from inside the process (size- and/or time-based),
// unlike plain pino/file — which never rotates on its own and, since this
// box has no process supervisor to signal a reopen after an external
// rename (no PM2/Docker/NSSM), an
// external rotation script would either lose the rename to the open file
// handle or require a restart to take effect. 20MB/file, daily, 14 kept.
const baseLogger = appConfig.isProduction
  ? pino(loggerOptions, pino.transport({
      targets: [
        {
          target: 'pino-roll',
          level: 'info',
          options: { file: path.join(logDir, 'gms'), size: '20m', frequency: 'daily', limit: { count: 14 }, mkdir: true },
        },
        {
          target: 'pino-roll',
          level: 'error',
          options: { file: path.join(logDir, 'error'), size: '20m', frequency: 'daily', limit: { count: 14 }, mkdir: true },
        },
      ]
    }))
  : pino({
      ...loggerOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      },
    });

/**
 * Enterprise Context-Aware Logger
 */
export const logger = new Proxy(baseLogger, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function' && ['info', 'error', 'warn', 'debug', 'fatal', 'trace'].includes(prop as string)) {
      return (...args: any[]) => {
        const requestId = getRequestId();
        if (requestId) {
          if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
            args[0].requestId = requestId;
          } else {
            args.unshift({ requestId });
          }
        }
        return value.apply(target, args);
      };
    }
    return value;
  }
});

export const createLogger = (bindings: Record<string, unknown>) => logger.child(bindings);
