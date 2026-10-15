import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const isRedisAvailable = jest.fn(() => false);

jest.mock('../infrastructure/cache/redis.client', () => ({
  isRedisAvailable: () => isRedisAvailable(),
  redisClient: null,
}));

jest.mock('../infrastructure/queue/queue', () => ({
  enqueueJob: jest.fn(async () => true),
  queues: {},
  QUEUE_NAMES: {
    EMAIL_NOTIFICATION: 'EMAILS',
    SMS_NOTIFICATION: 'SMS',
    VISIT_REMINDER: 'REMINDERS',
    EXPIRATIONS: 'EXPIRATIONS',
    ACCESS_PROVISIONING: 'ACCESS_PROVISIONING',
    DEAD_LETTER: 'DEAD_LETTER',
    SLA_ENFORCEMENT: 'SLA_ENFORCEMENT',
    SLA_ESCALATION: 'SLA_ESCALATION',
    RECEPTION_SLA_ENFORCEMENT: 'RECEPTION_SLA_ENFORCEMENT',
    NO_SHOW: 'NO_SHOW',
    IDENTITY_VERIFICATION: 'IDENTITY_VERIFICATION',
  },
}));

jest.mock('../infrastructure/queue/workers/email.worker', () => ({
  processEmailJobData: jest.fn(async () => undefined),
}));

jest.mock('../infrastructure/queue/workers/sms.worker', () => ({
  processSmsJobData: jest.fn(async () => undefined),
}));

jest.mock('../infrastructure/queue/workers/reminder.worker', () => ({
  processReminderJobData: jest.fn(async () => undefined),
}));

jest.mock('../infrastructure/queue/workers/expiry.worker', () => ({
  processExpiryJobData: jest.fn(async () => undefined),
}));

jest.mock('../infrastructure/queue/workers/credential.worker', () => ({
  processCredentialJobData: jest.fn(async () => undefined),
}));

import { appConfig } from '../config/app.config';
import { dispatchQueueJob } from '../infrastructure/queue/dispatchers';
import { enqueueJob, queues } from '../infrastructure/queue/queue';
import { processEmailJobData } from '../infrastructure/queue/workers/email.worker';

describe('Queue dispatchers', () => {
  const originalIsProduction = appConfig.isProduction;

  beforeEach(() => {
    appConfig.isProduction = originalIsProduction;
    Object.keys(queues).forEach((key) => delete (queues as Record<string, unknown>)[key]);
    isRedisAvailable.mockReturnValue(false);
    jest.clearAllMocks();
  });

  afterEach(() => {
    appConfig.isProduction = originalIsProduction;
  });

  it('falls back to inline execution outside production when Redis queues are unavailable', async () => {
    appConfig.isProduction = false;

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 });

    expect(processEmailJobData).toHaveBeenCalledWith('VisitApprovedEmail', { visitId: 10 });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('falls back to inline execution in production when a Redis-backed queue is unavailable', async () => {
    appConfig.isProduction = true;

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 });

    expect(processEmailJobData).toHaveBeenCalledWith('VisitApprovedEmail', { visitId: 10 });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('uses Redis-backed queue dispatch when the queue is available', async () => {
    appConfig.isProduction = true;
    isRedisAvailable.mockReturnValue(true);
    (queues as Record<string, unknown>).EMAILS = { name: 'EMAILS' };

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 });

    expect(enqueueJob).toHaveBeenCalledWith('EMAILS', 'VisitApprovedEmail', { visitId: 10 });
    expect(processEmailJobData).not.toHaveBeenCalled();
  });

  it('falls back to inline execution when Redis-backed dispatch throws', async () => {
    appConfig.isProduction = true;
    isRedisAvailable.mockReturnValue(true);
    (queues as Record<string, unknown>).EMAILS = { name: 'EMAILS' };
    (enqueueJob as jest.Mock).mockRejectedValueOnce(new Error('redis unavailable') as never);

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 });

    expect(enqueueJob).toHaveBeenCalledWith('EMAILS', 'VisitApprovedEmail', { visitId: 10 });
    expect(processEmailJobData).toHaveBeenCalledWith('VisitApprovedEmail', { visitId: 10 });
  });

  it('passes the outbox event id through as a stable BullMQ jobId so a retried outbox row cannot duplicate the side effect', async () => {
    appConfig.isProduction = true;
    isRedisAvailable.mockReturnValue(true);
    (queues as Record<string, unknown>).EMAILS = { name: 'EMAILS' };

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 }, 42);

    expect(enqueueJob).toHaveBeenCalledWith(
      'EMAILS',
      'VisitApprovedEmail',
      { visitId: 10 },
      { jobId: 'outbox-42' }
    );
    expect(processEmailJobData).not.toHaveBeenCalled();
  });

  it('falls back to inline execution when queue submission returns false', async () => {
    appConfig.isProduction = true;
    isRedisAvailable.mockReturnValue(true);
    (queues as Record<string, unknown>).EMAILS = { name: 'EMAILS' };
    (enqueueJob as jest.Mock).mockResolvedValueOnce(false as never);

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 }, 42);

    expect(processEmailJobData).toHaveBeenCalledWith('VisitApprovedEmail', { visitId: 10 });
  });

  it('omits jobId when no outbox event id is available (no regression for direct callers)', async () => {
    appConfig.isProduction = true;
    isRedisAvailable.mockReturnValue(true);
    (queues as Record<string, unknown>).EMAILS = { name: 'EMAILS' };

    await dispatchQueueJob('EMAILS', 'VisitApprovedEmail', { visitId: 10 });

    expect(enqueueJob).toHaveBeenCalledWith('EMAILS', 'VisitApprovedEmail', { visitId: 10 });
  });
});
