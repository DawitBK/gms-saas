import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { OutboxProcessor } from '../infrastructure/events/outbox.processor';
import { EventBus } from '../infrastructure/events/eventBus';
import * as queueDispatchers from '../infrastructure/queue/dispatchers';
import * as outboxRepository from '../infrastructure/events/outbox.repository';

describe('OutboxProcessor', () => {
  beforeEach(() => {
    jest.spyOn(outboxRepository, 'claimPendingOutbox').mockResolvedValue([] as any);
    jest.spyOn(outboxRepository, 'markOutboxProcessed').mockResolvedValue(undefined as any);
    jest.spyOn(outboxRepository, 'markOutboxFailed').mockResolvedValue(undefined as any);

    jest.spyOn(EventBus, 'emitEvent').mockReturnValue(undefined as any);
    jest.spyOn(queueDispatchers, 'dispatchQueueJob').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dispatches event-bus and queue jobs then marks them processed', async () => {
    jest.spyOn(outboxRepository, 'claimPendingOutbox').mockResolvedValue([
      {
        id: 1,
        channel: 'EVENT_BUS',
        payload: { type: 'VISIT.CREATED', metadata: { entity_id: 10 } },
      } as any,
      {
        id: 2,
        channel: 'QUEUE_JOB',
        queue_name: 'EMAILS',
        job_name: 'VisitApprovedEmail',
        payload: { visitId: 10, guestId: 7, template: 'APPROVED' },
      } as any,
    ]);

    await OutboxProcessor.processPendingEvents();

    expect(EventBus.emitEvent).toHaveBeenCalledWith({
      type: expect.any(String),
      metadata: expect.objectContaining({ entity_id: 10 }),
    });
    expect(queueDispatchers.dispatchQueueJob).toHaveBeenCalledWith(
      'EMAILS',
      'VisitApprovedEmail',
      expect.objectContaining({ visitId: 10 }),
      2
    );
    expect(outboxRepository.markOutboxProcessed).toHaveBeenCalledTimes(2);
    expect(outboxRepository.markOutboxFailed).not.toHaveBeenCalled();
  });

  it('marks a failing outbox row as failed with retry metadata', async () => {
    jest.spyOn(outboxRepository, 'claimPendingOutbox').mockResolvedValue([
      {
        id: 3,
        channel: 'QUEUE_JOB',
        queue_name: 'EMAILS',
        job_name: 'VisitApprovedEmail',
        payload: { visitId: 88 },
        attempt_count: 2,
        max_attempts: 10,
      } as any,
    ]);

    jest.spyOn(queueDispatchers, 'dispatchQueueJob').mockRejectedValueOnce(new Error('smtp down'));

    await OutboxProcessor.processPendingEvents();

    expect(outboxRepository.markOutboxFailed).toHaveBeenCalledWith(3, 2, 'smtp down', 10);
    expect(outboxRepository.markOutboxProcessed).not.toHaveBeenCalled();
  });
});
