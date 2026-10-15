import { logger } from '../../core/logger/logger';

interface RetryOptions {
  action: string;
  module: string;
  maxAttempts?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = process.env.NODE_ENV === 'test' ? 1 : (options.maxAttempts ?? 3);
  const initialDelayMs = process.env.NODE_ENV === 'test' ? 0 : (options.initialDelayMs ?? 500);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (!options.timeoutMs) {
        return await operation();
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation(),
          new Promise<T>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`${options.action} timed out after ${options.timeoutMs}ms`)),
              options.timeoutMs
            );
          }),
        ]);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          module: options.module,
          action: options.action,
          attempt,
          maxAttempts,
          err: error,
        },
        'External operation failed'
      );

      if (attempt < maxAttempts) {
        await sleep(initialDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.action} failed`);
}
