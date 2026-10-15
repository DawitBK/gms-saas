import * as Sentry from '@sentry/node';
import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { getRequestId } from '../../core/utils/requestId';

/**
 * Sentry Observability Service
 * 
 * Handles error tracking and performance monitoring.
 * Integrated with the system's Trace Context for pervasive observability.
 */
export const initializeSentry = () => {
  if (!appConfig.isProduction) {
    logger.info({ module: 'observability', action: 'sentry.init' }, 'Sentry skipped (not in production mode)');
    return;
  }

  if (!appConfig.observability.sentryDsn) {
    logger.info({ module: 'observability', action: 'sentry.init' }, 'Sentry DSN not configured, skipping');
    return;
  }

  Sentry.init({
    dsn: appConfig.observability.sentryDsn,
    environment: appConfig.env,
    tracesSampleRate: appConfig.observability.sentryTraceSampleRate,
  });
};

/**
 * Captures an exception with integrated Trace Context.
 * Automatically injects the unique requestId as a Sentry tag.
 */
export const captureException = (error: unknown, context?: Record<string, unknown>) => {
  if (!appConfig.observability.sentryDsn) {
    return;
  }

  const requestId = getRequestId();

  Sentry.withScope((scope) => {
    if (requestId) {
      scope.setTag('requestId', requestId);
    }
    
    Object.entries(context ?? {}).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureException(error);
  });
};
