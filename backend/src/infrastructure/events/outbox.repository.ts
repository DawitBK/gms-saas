import { Op, Transaction, where, col, literal } from 'sequelize';
import { sequelize } from '../database/sequelize';
import { OutboxEvent } from '../database/models';
import { OTP_PAYLOAD_KEYS } from '../../shared/utils/otp';

const DEFAULT_BATCH_SIZE = 25;

// FIX: PROCESSING rows were never reclaimed by anything — a process crash
// between claiming a row and marking it processed/failed left it stuck
// forever, with no operator-visible signal. Anchor the reclaim to
// `locked_at` (already stamped fresh on every claim below) rather than
// `available_at`, which is roughly the row's original due time and would
// reclaim a merely-slow-but-still-running row out from under itself.
const STALE_PROCESSING_MS = 5 * 60 * 1000;

/**
 * SQL that removes one-time codes from `outbox_events.payload` and leaves an
 * `otp_redacted: true` marker. Applied when a row reaches a terminal state
 * (PROCESSED or DEAD_LETTER), so a code is never retained once nothing can send
 * it any more. Idempotent: a payload without the keys is returned unchanged,
 * and the marker is only added when a key was actually removed. Also used by
 * scripts/redact-outbox-otps.ts for rows stored before this existed.
 */
const otpKeyList = OTP_PAYLOAD_KEYS.map((k) => `'${k}'`);
export const REDACT_OTP_PAYLOAD_SQL =
  `CASE WHEN jsonb_exists_any(payload, ARRAY[${otpKeyList.join(',')}]) ` +
  `THEN (payload${otpKeyList.map((k) => ` - ${k}`).join('')}) || '{"otp_redacted": true}'::jsonb ` +
  `ELSE payload END`;

export const createOutboxRecord = async (data: Record<string, unknown>, transaction?: Transaction) => {
  return OutboxEvent.create(data as any, { transaction });
};

export const claimPendingOutbox = async (limit = DEFAULT_BATCH_SIZE) => {
  return sequelize.transaction(async (transaction) => {
    // A PROCESSING row that has already exhausted its retries (stuck there
    // by a crash mid-attempt) would otherwise be reclaimed and burn attempts
    // forever without ever reaching a terminal state — move it straight to
    // DEAD_LETTER instead so it surfaces on the failure dashboard.
    await OutboxEvent.update(
      {
        status: 'DEAD_LETTER',
        locked_at: null,
        error_message: 'Reclaimed from stale PROCESSING after exhausting retries (likely crashed mid-attempt)',
        payload: literal(REDACT_OTP_PAYLOAD_SQL),
      },
      {
        where: {
          [Op.and]: [
            { status: 'PROCESSING' },
            { locked_at: { [Op.lte]: new Date(Date.now() - STALE_PROCESSING_MS) } },
            where(col('attempt_count'), Op.gte, col('max_attempts')),
          ],
        },
        transaction,
      }
    );

    const rows = await OutboxEvent.findAll({
      where: {
        [Op.or]: [
          { status: { [Op.in]: ['PENDING', 'FAILED'] }, available_at: { [Op.lte]: new Date() } },
          { status: 'PROCESSING', locked_at: { [Op.lte]: new Date(Date.now() - STALE_PROCESSING_MS) } },
        ],
      },
      order: [['created_at', 'ASC']],
      limit,
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });

    for (const row of rows) {
      row.status = 'PROCESSING';
      row.locked_at = new Date();
      row.last_attempt_at = new Date();
      row.attempt_count += 1;
      row.error_message = null;
      await row.save({ transaction });
    }

    return rows;
  });
};

export const markOutboxProcessed = async (id: number) => {
  await OutboxEvent.update(
    {
      status: 'PROCESSED',
      processed_at: new Date(),
      locked_at: null,
      error_message: null,
      // Dispatched: nothing needs the one-time code in this row any more.
      payload: literal(REDACT_OTP_PAYLOAD_SQL),
    },
    { where: { id } }
  );
};

export const markOutboxFailed = async (id: number, attemptCount: number, errorMessage: string, maxAttempts: number) => {
  // Aligned with DMS's outbox backoff curve (infrastructure/queue/outbox.ts):
  // 30s * 4^(attempts-1), capped at 1 hour. Was 2^attempts seconds capped at
  // 5 minutes with up to 10 attempts - a much faster, much longer-lived retry
  // policy than DMS's for the same class of transient failure, with no stated
  // reason for the difference.
  const delaySeconds = Math.min(3_600, 30 * 4 ** Math.max(0, attemptCount - 1));
  const nextStatus = attemptCount >= maxAttempts ? 'DEAD_LETTER' : 'FAILED';

  await OutboxEvent.update(
    {
      status: nextStatus,
      locked_at: null,
      error_message: errorMessage,
      available_at: new Date(Date.now() + delaySeconds * 1000),
      // A retry (FAILED) still needs the sealed code; a permanent failure
      // (DEAD_LETTER) must not keep one.
      ...(nextStatus === 'DEAD_LETTER' ? { payload: literal(REDACT_OTP_PAYLOAD_SQL) } : {}),
    },
    { where: { id } }
  );
};

export const listRecentOutboxFailures = async (limit = 20) => {
  // FIX: DEAD_LETTER rows (exhausted retries) used to drop out of this view
  // entirely once they stopped retrying — exactly the ones an operator most
  // needs to see.
  return OutboxEvent.findAll({
    where: { status: { [Op.in]: ['FAILED', 'DEAD_LETTER'] } },
    order: [['updated_at', 'DESC']],
    limit,
  });
};

export const findOutboxById = async (id: number) => {
  return OutboxEvent.findByPk(id);
};

export const retryOutboxEvent = async (id: number) => {
  await OutboxEvent.update(
    {
      status: 'PENDING',
      available_at: new Date(),
      locked_at: null,
      error_message: null,
    },
    { where: { id } }
  );

  return findOutboxById(id);
};
