import * as dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../infrastructure/database/sequelize';
import {
  createOutboxRecord,
  findOutboxById,
  markOutboxFailed,
  markOutboxProcessed,
} from '../infrastructure/events/outbox.repository';
import { otpEmailJobPayload } from '../shared/utils/otp';

/**
 * A one-time code must not outlive its dispatch in outbox_events.payload.
 * Real-database test, like outbox-dead-letter.test.ts.
 */
describe('Outbox one-time-code redaction', () => {
  const ids: number[] = [];

  const queueEmail = async (payload: Record<string, unknown>, maxAttempts = 3) => {
    const row = await createOutboxRecord({
      channel: 'QUEUE_JOB',
      status: 'PENDING',
      event_type: 'MESSAGE_SENT',
      queue_name: 'EMAILS',
      job_name: 'SendVerification',
      payload,
      max_attempts: maxAttempts,
    });
    const id = Number(row.getDataValue('id'));
    ids.push(id);
    return id;
  };
  const payloadOf = async (id: number) => (await findOutboxById(id))?.getDataValue('payload') as Record<string, unknown>;

  afterAll(async () => {
    if (ids.length) await sequelize.query('DELETE FROM outbox_events WHERE id IN (:ids)', { replacements: { ids } });
    await sequelize.close();
  });

  it('is stored without a plaintext code when queued the way AuthService queues it', async () => {
    const id = await queueEmail(otpEmailJobPayload(41, '135790', 'PASSWORD_RESET'));
    const payload = await payloadOf(id);
    expect(payload.otp_sealed).toEqual(expect.any(String));
    expect(JSON.stringify(payload)).not.toContain('135790');
  });

  it('keeps the sealed code while the row is only FAILED (a retry must still send it)', async () => {
    const id = await queueEmail(otpEmailJobPayload(42, '246802', 'REGISTRATION_VERIFICATION'));
    await markOutboxFailed(id, 1, 'smtp down', 3);
    const row = await findOutboxById(id);
    expect(row?.getDataValue('status')).toBe('FAILED');
    expect((await payloadOf(id)).otp_sealed).toEqual(expect.any(String));
  });

  it('removes the code once the row is PROCESSED, leaving the rest of the payload', async () => {
    const id = await queueEmail({ ...otpEmailJobPayload(43, '111222', 'TWO_FACTOR_AUTH') });
    await markOutboxProcessed(id);
    const payload = await payloadOf(id);
    expect(payload).toEqual({ guestId: 43, template: 'TWO_FACTOR_AUTH', otp_redacted: true });
    expect((await findOutboxById(id))?.getDataValue('status')).toBe('PROCESSED');
  });

  it('removes a legacy plaintext code too', async () => {
    const id = await queueEmail({ guestId: 44, otp: '999888', template: 'PASSWORD_RESET' });
    await markOutboxProcessed(id);
    expect(await payloadOf(id)).toEqual({ guestId: 44, template: 'PASSWORD_RESET', otp_redacted: true });
  });

  it('removes the code when the row is permanently failed (DEAD_LETTER)', async () => {
    const id = await queueEmail(otpEmailJobPayload(45, '333444', 'PASSWORD_RESET'), 2);
    await markOutboxFailed(id, 2, 'gave up', 2);
    expect((await findOutboxById(id))?.getDataValue('status')).toBe('DEAD_LETTER');
    const payload = await payloadOf(id);
    expect(payload).toEqual({ guestId: 45, template: 'PASSWORD_RESET', otp_redacted: true });
  });

  it('leaves payloads that carry no code exactly as they were, and is idempotent', async () => {
    const plain = await queueEmail({ visitId: 7, guestId: 8, template: 'APPROVED' });
    await markOutboxProcessed(plain);
    expect(await payloadOf(plain)).toEqual({ visitId: 7, guestId: 8, template: 'APPROVED' });

    const sealed = await queueEmail(otpEmailJobPayload(46, '555666', 'PASSWORD_RESET'));
    await markOutboxProcessed(sealed);
    const once = await payloadOf(sealed);
    await markOutboxProcessed(sealed);
    expect(await payloadOf(sealed)).toEqual(once);
  });
});
