import { EventBus } from '../../infrastructure/events/eventBus';
import { EventTypes } from '../../infrastructure/events/eventTypes';
import { logger } from '../../core/logger/logger';

/**
 * Auth module event subscriptions.
 *
 * Imported for its SIDE EFFECTS — `import './modules/auth/auth.events'` in
 * main.ts and bin/outbox.worker.ts. The subscriptions below register at import
 * time; there is nothing to call. An exported `initializeAuthEvents()` used to
 * sit at the bottom of this file suggesting otherwise: it was a no-op that
 * logged "initialized" and nothing ever invoked it. Removed 2026-09-06.
 */

// Example: Tracking logins for audit or analytics
EventBus.subscribe(EventTypes.USER_LOGGED_IN, (payload) => {
  logger.info({ userId: payload.metadata.entity_id }, 'AuthEvent: Tracking user login pulse');
});

// Example: Triggering MFA or session cleanup
EventBus.subscribe(EventTypes.USER_REGISTERED, (payload) => {
  logger.info({ userId: payload.metadata.entity_id }, 'AuthEvent: New user registered pulse.');
});
