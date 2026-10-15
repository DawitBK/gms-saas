import { logger } from '../../../core/logger/logger';

/**
 * Enterprise Worker Registry
 * Starts all background consumers for GMS domain events.
 * 
 * We use require() instead of dynamic import() to ensure compatibility with 
 * ts-node/register during development while maintaining non-blocking bootstrap.
 */
export const startWorkers = async () => {
  const workerModules = [
    './email.worker',
    './sms.worker',
    './expiry.worker',
    './reminder.worker',
    './credential.worker',
    // NOTE: identity.worker intentionally omitted — no such module exists and
    // no consumer of QUEUE_NAMES.IDENTITY_VERIFICATION is implemented. Listing
    // it here only produced a caught "Worker module failed to load" error on
    // every boot. The matching enqueue in auth.service.register() is disabled
    // for the same reason; re-add both together if identity verification is built.
  ];

  for (const modulePath of workerModules) {
    try {
      require(modulePath);
    } catch (err) {
      logger.error({ err, modulePath }, 'Worker module failed to load');
    }
  }

  // Functional workers
  try {
    const { createSlaWorker } = require('./sla.worker');
    createSlaWorker();
  } catch (err) {
    logger.error({ err }, 'Failed to start SLA worker');
  }

  try {
    const { createNoShowWorker } = require('./noshow.worker');
    createNoShowWorker();
  } catch (err) {
    logger.error({ err }, 'Failed to start NoShow worker');
  }

  try {
    const { createReceptionSlaWorker } = require('./reception-sla.worker');
    createReceptionSlaWorker();
  } catch (err) {
    logger.error({ err }, 'Failed to start Reception SLA worker');
  }

  logger.info('Background worker initialization complete.');
};

export { closeWorkers } from './registry';
