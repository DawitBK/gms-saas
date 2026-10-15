import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestContextStorage } from './cls';

// FIX: a client-controlled x-correlation-id/x-request-id was taken verbatim
// and relayed into every log line for the request (and into the SSO
// gateway's own logs, since SSO proxies this header through to GMS
// unchanged) — no length or character restriction, so a client could inject
// control characters/newlines to forge log lines, or send an unbounded
// value to bloat log storage. Only accept a value that already looks like a
// real correlation ID (bounded length, safe charset); anything else is
// treated as absent and a fresh one is minted instead of being sanitized
// in place, so a rejected value never partially survives into the logs.
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

function sanitizeIncomingId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return SAFE_CORRELATION_ID.test(value) ? value : undefined;
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId =
    sanitizeIncomingId(req.headers['x-correlation-id']) ??
    sanitizeIncomingId(req.headers['x-request-id']) ??
    randomUUID();
  req.headers['x-request-id'] = requestId;
  req.headers['x-correlation-id'] = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-ID', requestId);

  requestContextStorage.run({ requestId }, () => {
    next();
  });
};

/**
 * Retrieves the current requestId from the AsyncLocalStorage context.
 * Returns undefined if called outside of a request context.
 */
export const getRequestId = (): string | undefined => {
  return requestContextStorage.getStore()?.requestId;
};
