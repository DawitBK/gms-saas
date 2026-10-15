import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';
import { IdempotencyKey } from '../../infrastructure/database/models/idempotencyKey.model';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';
import { logger } from '../../core/logger/logger';

/** Fingerprint of "what this request actually is" — a reused Idempotency-Key
 *  against a different user, endpoint, or body must not silently replay the
 *  first request's response; it's a client bug (or a key collision) and
 *  should surface as a conflict, not a wrong answer. */
function fingerprintRequest(req: Request): { userId: number | null; endpoint: string; requestHash: string } {
  const userId = (req as any).user?.id ?? null;
  const endpoint = `${req.method ?? ''} ${req.originalUrl ?? ''}`;
  const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
  return { userId, endpoint, requestHash };
}

export const idempotencyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['idempotency-key'] as string;

  if (!key) {
    return next(); // Opt-in endpoint, safely bypass if none supplied
  }

  const { userId, endpoint, requestHash } = fingerprintRequest(req);

  try {
    const existing = await IdempotencyKey.findByPk(key);

    if (existing) {
      // A null stored fingerprint means the row was created before this
      // column existed (or by a resubmission with no body) — nothing to
      // compare against, so fall through to the existing replay behavior
      // rather than false-positive a conflict.
      if (existing.request_hash && (existing.user_id !== userId || existing.endpoint !== endpoint || existing.request_hash !== requestHash)) {
        return next(new AppError('This Idempotency-Key was already used for a different request', ErrorCodes.INVALID_INPUT, 409));
      }

      if (!existing.response) {
        // Request is still processing in another worker thread concurrently
        return next(new AppError('Conflict. Request already processing', ErrorCodes.INVALID_INPUT, 409));
      }

      // Stored response may include status and body for accurate replay.
      const cached = existing.response;
      if (cached && typeof cached === 'object' && 'status' in cached && 'body' in cached) {
        return res.status(Number(cached.status)).json(cached.body);
      }

      return res.status(200).json(cached);
    }

    // Lock the key immediately indicating processing. Handle races safely.
    try {
      await IdempotencyKey.create({ key, response: null, user_id: userId, endpoint, request_hash: requestHash });
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) {
        throw error;
      }

      const raced = await IdempotencyKey.findByPk(key);
      if (!raced) {
        return next(new AppError('Conflict. Request already processing', ErrorCodes.INVALID_INPUT, 409));
      }
      if (raced.request_hash && (raced.user_id !== userId || raced.endpoint !== endpoint || raced.request_hash !== requestHash)) {
        return next(new AppError('This Idempotency-Key was already used for a different request', ErrorCodes.INVALID_INPUT, 409));
      }
      if (!raced.response) {
        return next(new AppError('Conflict. Request already processing', ErrorCodes.INVALID_INPUT, 409));
      }

      const cached = raced.response;
      if (cached && typeof cached === 'object' && 'status' in cached && 'body' in cached) {
        return res.status(Number(cached.status)).json(cached.body);
      }
      return res.status(200).json(cached);
    }

    let persisted = false;
    const persistResponse = (status: number, body: unknown) => {
      if (persisted) return;
      persisted = true;

      /**
       * Never cache a server error against the idempotency key.
       *
       * Every outcome used to be persisted, including 5xx. An idempotency key
       * is generated once per user action and retried with the SAME key, so a
       * booking that hit a transient 500 — a database blip, a Redis timeout,
       * an unhandled edge — had that 500 written against its key permanently.
       * Every retry then replayed the stored failure without touching the
       * handler, and the guest could never complete that booking: they had to
       * abandon the form and start again with a fresh key, if they realised
       * that was the problem at all.
       *
       * Client errors (4xx) ARE cached deliberately. They are deterministic —
       * a validation failure or a permission denial will fail identically on
       * replay — and caching them is what stops a retry storm re-running
       * validation against the database.
       *
       * Releasing the key on a 5xx also means the retry re-enters the real
       * handler, which is the behaviour the caller expects from a retry after
       * a server error.
       */
      const finalStatus = status || 200;
      if (finalStatus >= 500) {
        void IdempotencyKey.destroy({ where: { key } }).catch((error: unknown) => {
          logger.error(
            { error, key, status: finalStatus },
            'Failed to release idempotency key after a server error — a retry with the same key may replay the failure',
          );
        });
        return;
      }

      const toPersist = { status: finalStatus, body };
      void IdempotencyKey.update({ response: toPersist }, { where: { key } }).catch((error: unknown) => {
        logger.error({ error, key }, 'Failed to persist idempotency response');
      });
    };

    // Intercept outbound response bodies to capture and persist the result
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      persistResponse(res.statusCode || 200, body);
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = ((body?: any) => {
      persistResponse(res.statusCode || 200, body ?? null);
      return originalSend(body);
    }) as any;

    // If the connection closes before a response is persisted, release the lock.
    res.on('close', () => {
      if (persisted || res.writableEnded) return;
      void IdempotencyKey.destroy({ where: { key, response: null } }).catch((error: unknown) => {
        logger.error({ error, key }, 'Failed to release stale idempotency lock');
      });
    });

    next();
  } catch (err) {
    next(err);
  }
};
