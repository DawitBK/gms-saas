import { Transaction } from 'sequelize';
import { EnterpriseEventPayload } from './eventTypes';
import { QUEUE_NAMES } from '../queue/queue';
import { createOutboxRecord } from './outbox.repository';

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const publishEvent = async (
  payload: EnterpriseEventPayload,
  transaction?: Transaction,
  aggregate?: { type?: string; id?: number | string }
) => {
  return createOutboxRecord(
    {
      channel: 'EVENT_BUS',
      status: 'PENDING',
      aggregate_type: aggregate?.type ?? null,
      aggregate_id: aggregate?.id ? String(aggregate.id) : null,
      event_type: payload.type,
      payload,
    },
    transaction
  );
};

export const enqueueJob = async (
  queueName: QueueName,
  jobName: string,
  payload: Record<string, unknown>,
  transaction?: Transaction,
  aggregate?: { type?: string; id?: number | string },
  availableAt?: Date
) => {
  return createOutboxRecord(
    {
      channel: 'QUEUE_JOB',
      status: 'PENDING',
      aggregate_type: aggregate?.type ?? null,
      aggregate_id: aggregate?.id ? String(aggregate.id) : null,
      event_type: 'MESSAGE_SENT',
      queue_name: queueName,
      job_name: jobName,
      payload,
      available_at: availableAt ?? new Date(),
    },
    transaction
  );
};
