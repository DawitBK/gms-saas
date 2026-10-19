import { Job } from 'bullmq';
import { captureException } from '../../../shared/services/sentry.service';
import { jobDurationSeconds, jobFailuresCounter } from '../../../shared/services/metrics.service';
import { enqueueDeadLetter } from '../queue';
import { redactOtpFields } from '../../../shared/utils/otp';

export const trackJob = async <T>(queueName: string, job: Job, handler: () => Promise<T>) => {
  const started = process.hrtime.bigint();
  try {
    const result = await handler();
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    jobDurationSeconds.observe({ queue: queueName, job_name: job.name, status: 'completed' }, durationSeconds);
    return result;
  } catch (error) {
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
    jobDurationSeconds.observe({ queue: queueName, job_name: job.name, status: 'failed' }, durationSeconds);
    jobFailuresCounter.inc({ queue: queueName, job_name: job.name });
    captureException(error, { module: 'queue', queueName, jobName: job.name, jobId: job.id });

    /**
     * Dead-letter only when BullMQ has given up, not on every attempt.
     *
     * This used to write a dead-letter entry on each failed try. With the
     * default three attempts, one transient blip — a Redis hiccup, an SMTP
     * timeout, a UniFi controller restart — produced up to three dead-letter
     * rows for a job that then succeeded on retry and needed no attention at
     * all. The dead-letter queue is the one place an operator looks to answer
     * "what has permanently failed", and filling it with recovered transients
     * is how that queue stops being read.
     *
     * `attemptsMade` is 1-based on the attempt currently failing, so the
     * comparison against the job's own configured max identifies the last one.
     * When the limit cannot be determined, err toward recording — an
     * over-reported permanent failure is recoverable; a silent one is not.
     */
    const maxAttempts = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    if (isFinalAttempt) {
      await enqueueDeadLetter(queueName, job.name, {
        jobId: job.id,
        queueName,
        jobName: job.name,
        // The dead-letter queue keeps its entries forever: never copy a one-time code into it.
        data: redactOtpFields(job.data),
        attempts: job.attemptsMade,
        failedReason: error instanceof Error ? error.message : 'Unknown error',
        failedAt: new Date().toISOString(),
      });
    }
    throw error;
  }
};
