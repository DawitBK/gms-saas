import * as dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../infrastructure/database/sequelize';
import { createOutboxRecord, markOutboxFailed, findOutboxById } from '../infrastructure/events/outbox.repository';

describe('Outbox Dead Letter Logic', () => {
  let eventId: number;

  beforeAll(async () => {
    // Assuming DB is seeded and synced
  });

  afterAll(async () => {
    // Teardown
    await sequelize.close();
  });

  it('should retry a failed event until max attempts are reached, then DEAD_LETTER it', async () => {
    const event = await createOutboxRecord({
      channel: 'QUEUE_JOB',
      status: 'PENDING',
      event_type: 'TEST_EVENT',
      payload: { test: true },
      max_attempts: 2
    });

    eventId = Number(event.getDataValue('id'));

    // First failure
    await markOutboxFailed(eventId, 1, 'First error', 2);
    let updated = await findOutboxById(eventId);
    expect(updated?.getDataValue('status')).toBe('FAILED');
    expect(updated?.getDataValue('error_message')).toBe('First error');

    // Second (max) failure
    await markOutboxFailed(eventId, 2, 'Final error', 2);
    updated = await findOutboxById(eventId);
    expect(updated?.getDataValue('status')).toBe('DEAD_LETTER');
    expect(updated?.getDataValue('error_message')).toBe('Final error');
  });
});
