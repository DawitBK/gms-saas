import { NextFunction, Request, Response } from 'express';
import { createLogger } from '../../core/logger/logger';
import { httpRequestCounter, httpRequestDurationSeconds } from '../services/metrics.service';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.requestId ?? String(req.headers['x-request-id'] ?? '');
  const startedAt = process.hrtime.bigint();
  req.log = createLogger({
    module: 'http',
    requestId,
    userId: req.user?.id ?? null,
    method: req.method,
    path: req.originalUrl,
  });

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const statusCode = String(res.statusCode);

    httpRequestCounter.inc({ method: req.method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe({ method: req.method, route, status_code: statusCode }, durationSeconds);

    req.log?.info(
      {
        action: 'request.completed',
        route,
        statusCode: res.statusCode,
        durationSeconds,
      },
      'HTTP request completed'
    );
  });

  next();
};
