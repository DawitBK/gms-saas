import { EventBus } from '../events/eventBus';
import { EventTypes } from '../events/eventTypes';
import { io } from './socket';
import { logger } from '../../core/logger/logger';

export const initializeGateway = () => {
  // All service-layer EventBus emissions are proxied here to Socket.io rooms.
  // Services remain completely free of io references — clean decoupling.

  EventBus.subscribe(EventTypes.VISIT_CREATED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_CREATED, data: payload });
    logger.debug({ room }, 'Gateway → VISIT_CREATED broadcast');
  });

  EventBus.subscribe(EventTypes.VISIT_APPROVED, (payload) => {
    const actorRoom  = `user_${payload.metadata.actor_id}`;
    const officeRoom = `office_${payload.metadata.office_id}`;
    io?.to(actorRoom).to(officeRoom).emit('event', { type: EventTypes.VISIT_APPROVED, data: payload });
    logger.debug({ actorRoom, officeRoom }, 'Gateway → VISIT_APPROVED broadcast');
  });

  EventBus.subscribe(EventTypes.VISIT_CREDENTIAL_ACTIVE, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_CREDENTIAL_ACTIVE, data: payload });
    logger.debug({ room }, 'Gateway → VISIT_CREDENTIAL_ACTIVE broadcast');
  });

  EventBus.subscribe(EventTypes.VISIT_CANCELLED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_CANCELLED, data: payload });
  });

  EventBus.subscribe(EventTypes.VISIT_RESCHEDULED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_RESCHEDULED, data: payload });
  });

  EventBus.subscribe(EventTypes.VISIT_REASSIGNED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_REASSIGNED, data: payload });
  });

  EventBus.subscribe(EventTypes.VISIT_ESCALATED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_ESCALATED, data: payload });
  });

  EventBus.subscribe(EventTypes.VISIT_CHECKED_IN, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_CHECKED_IN, data: payload });
  });

  EventBus.subscribe(EventTypes.VISIT_COMPLETED, (payload) => {
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.VISIT_COMPLETED, data: payload });
  });

  EventBus.subscribe(EventTypes.SLOT_LOCKED, (payload) => {
    // Broadcast slot-locked so dashboards can grey out the slot in real-time
    const room = `office_${payload.metadata.office_id}`;
    io?.to(room).emit('event', { type: EventTypes.SLOT_LOCKED, data: payload });
  });

  EventBus.subscribe(EventTypes.NOTIFICATION_CREATED, (payload) => {
    // Target the individual user's private room
    io?.to(`user_${payload.metadata.entity_id}`).emit('notification', payload);
  });

  EventBus.subscribe(EventTypes.MESSAGE_SENT, (payload) => {
    const visitId = payload.metadata.visit_id ?? Number(payload.metadata.entity_id);
    const envelope = { type: EventTypes.MESSAGE_SENT, data: payload };
    if (Number.isFinite(visitId)) {
      io?.to(`visit_${visitId}`).emit('event', envelope);
    }
    const targets = payload.metadata.recipient_user_ids;
    if (Array.isArray(targets)) {
      for (const raw of targets) {
        const uid = Number(raw);
        if (Number.isFinite(uid)) {
          io?.to(`user_${uid}`).emit('event', envelope);
        }
      }
    }
  });

  logger.info('✅ WebSocket gateway wired to EventBus');
};
