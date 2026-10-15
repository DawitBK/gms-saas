import { EventEmitter } from 'events';
import { EnterpriseEventPayload, EventTypes } from './eventTypes';

/**
 * Enterprise EventBus
 * Orchestrates domain events within a single process.
 *
 * FIX: this used to also run its own Redis pub/sub cross-process relay,
 * stacked on top of Socket.IO's own Redis adapter (see socket.ts). Every
 * outbox row is only ever claimed and emitted locally by ONE instance, but
 * that instance's `io.to(room).emit()` calls are already fanned out to every
 * other instance's sockets by the Socket.IO Redis adapter — that's what it's
 * for. Re-broadcasting the same event via EventBus's own Redis channel made
 * every OTHER instance's local subscribers (this socket bridge included, but
 * also plain side-effect handlers like visit.events.ts) fire a second time,
 * doubling socket deliveries and, worse, duplicating non-idempotent side
 * effects (e.g. a second "visit approved" notification row) once per extra
 * instance. EventBus now only ever emits within the process that actually
 * processed the outbox row; cross-instance realtime fan-out is left entirely
 * to the Socket.IO Redis adapter, which already does it correctly.
 */
class SystemEventBus extends EventEmitter {
  /**
   * Emits an event to the local process only.
   */
  public emitEvent(payload: EnterpriseEventPayload) {
    super.emit(payload.type, payload);
  }

  /**
   * Domain-specific subscription helper
   */
  public subscribe(type: EventTypes, handler: (payload: EnterpriseEventPayload) => void) {
    this.on(type, handler);
    return () => this.off(type, handler);
  }
}

export const EventBus = new SystemEventBus();
