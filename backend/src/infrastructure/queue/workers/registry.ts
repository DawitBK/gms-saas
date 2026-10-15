import { Worker } from 'bullmq';
import { logger } from '../../../core/logger/logger';

const activeWorkers: Worker[] = [];

/**
 * Registers a worker for lifecycle management (graceful shutdown).
 */
export const registerWorker = (worker: Worker) => {
  activeWorkers.push(worker);
};

/**
 * Gracefully closes all registered workers.
 */
export const closeWorkers = async () => {
  logger.info({ count: activeWorkers.length }, 'Closing background workers...');
  
  await Promise.all(
    activeWorkers.map(async (worker) => {
      try {
        await worker.close();
        logger.debug({ queue: worker.name }, 'Worker closed.');
      } catch (err) {
        logger.error({ err, queue: worker.name }, 'Error closing worker.');
      }
    })
  );
  
  activeWorkers.length = 0;
};

if (process.env.NODE_ENV === 'test') {
  const target = globalThis as typeof globalThis & { __gmsTestCleanup?: { closeWorkers?: () => Promise<void> } };
  target.__gmsTestCleanup = { ...target.__gmsTestCleanup, closeWorkers };
}
