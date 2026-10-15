import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../../core/logger/logger';
import { appConfig } from '../../config/app.config';
import jwt from 'jsonwebtoken';
import { Visit } from '../database/models';
import * as chatAccess from '../../modules/messages/message.chat-access';
import { isAdminRole, isReceptionRole, normalizeRoles } from '../../shared/auth/roles';
import { EventBus } from '../events/eventBus';
import { EnterpriseEventPayload, EventTypes } from '../events/eventTypes';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient, isRedisAvailable } from '../cache/redis.client';
import { isSessionRevoked, RevocationCheckUnavailableError } from '../../shared/services/session-revocation.service';

export let io: SocketIOServer;

interface SocketAuthPayload {
  id: number;
  roles?: string[];
  office_id?: number;
  iat?: number;
}

/**
 * Bridges domain events from the EventBus to the WebSocket layer.
 * Enforces intelligent room-based fan-out.
 */
function bridgeEventBus(socketIo: SocketIOServer) {
  Object.values(EventTypes).forEach((type) => {
    EventBus.subscribe(type as EventTypes, (payload: EnterpriseEventPayload) => {
      const { entity_id, office_id, visit_id, recipient_user_ids } = payload.metadata;

      // 1. Target specific user rooms (Personal Notifications)
      if (recipient_user_ids && recipient_user_ids.length > 0) {
        recipient_user_ids.forEach((uid) => {
          socketIo.to(`user_${uid}`).emit('domain_event', payload);
        });
      }

      // 2. Target visit room (Active Meeting/Chat context)
      if (visit_id || (payload.type.startsWith('VISIT') && entity_id)) {
        const vid = visit_id || entity_id;
        socketIo.to(`visit_${vid}`).emit('domain_event', payload);
      }

      // 3. Target office room (Reception/Admin coordination)
      if (office_id) {
        socketIo.to(`office_${office_id}`).emit('domain_event', payload);
      }

      // 4. FIX: this used to broadcast to every connected socket on the
      // instance with no role/office check whenever an event carried none
      // of the scoping fields above. Every event type wired up today
      // happens to populate one of those fields, so this was unreachable —
      // but it failed OPEN, not closed: the moment a new event type (e.g.
      // login, registration, role-change) shipped without scoping metadata,
      // it would have silently broadcast org-wide instead of erroring
      // loudly. Fail closed: log and drop instead of a global emit.
      if (!office_id && !visit_id && !recipient_user_ids) {
        logger.warn(
          { eventType: payload.type },
          'Domain event has no office/visit/recipient scoping — dropping rather than broadcasting to every connected socket'
        );
      }
    });
  });
}

export const initializeSocket = (httpServer: HttpServer) => {
  io = new SocketIOServer(httpServer, {
    path: appConfig.socket.path,
    cors: {
      origin: [appConfig.clientOrigin, ...appConfig.corsAllowedOrigins],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  if (redisClient) {
    try {
      const pubClient = redisClient;
      const subClient = redisClient.duplicate();
      
      // Ensure the subClient doesn't crash the process on connection failure
      subClient.on('error', (err) => {
        logger.warn({ err: err.message, module: 'websocket' }, 'WebSocket subClient failed');
      });

      io.adapter(createAdapter(pubClient, subClient));
      logger.info({ module: 'websocket' }, 'WebSocket Redis adapter enabled for horizontal scaling');
    } catch (err) {
      logger.error({ err, module: 'websocket' }, 'Failed to enable Redis adapter. Falling back to in-memory.');
    }
  }

  // Security Middleware: Enforces JWT authentication for all socket upgrades
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication entirely missing'));

    try {
      const decoded = jwt.verify(token, appConfig.jwt.secret as string, { algorithms: ['HS256'] }) as SocketAuthPayload;

      // FIX: this only verified the JWT's signature/expiry — it never
      // checked session revocation, unlike auth.middleware.ts (the only
      // other place that does — see the comment there). A suspended or
      // offboarded user, or anyone who forced a sign-out, could keep opening
      // authenticated WebSocket connections with an already-issued token for
      // its full remaining lifetime. Mirror the same fail-closed-in-production
      // check here so a revoked token is rejected at the handshake too.
      if (typeof decoded.iat === 'number') {
        try {
          const revoked = await isSessionRevoked(decoded.id, decoded.iat);
          if (revoked) {
            return next(new Error('Session has been revoked'));
          }
        } catch (err) {
          if (err instanceof RevocationCheckUnavailableError) {
            return next(new Error('Authentication is temporarily unavailable'));
          }
          throw err;
        }
      }

      socket.data.user = decoded;
      next();
    } catch (err) {
      next(new Error('Token rejected during socket upgrade'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user?.id;
    logger.info({ socketId: socket.id, userId }, '🟢 Secure WebSocket client connected');

    socket.join(`user_${userId}`); 

    socket.on('join_office', (officeId: number | string) => {
      const roles = normalizeRoles(socket.data.user?.roles ?? []);
      const isPrivileged = roles.some((role) => isAdminRole(role) || isReceptionRole(role));
      const userOfficeId = socket.data.user?.office_id;
      const targetOfficeId = Number(officeId);

      if (!isPrivileged && Number(userOfficeId) !== targetOfficeId) {
        logger.warn({ socketId: socket.id, userId, officeId: targetOfficeId }, 'Denied unauthorized office room join');
        return;
      }
      socket.join(`office_${targetOfficeId}`);
    });

    socket.on('join_visit', async (visitId: number | string) => {
      const vid = Number(visitId);
      if (!Number.isFinite(vid) || vid <= 0) return;
      const u = socket.data.user as SocketAuthPayload | undefined;
      
      const visit = await Visit.findByPk(vid, {
        attributes: ['id', 'guest_id', 'office_id', 'assigned_host_id', 'status'],
      });
      if (!visit) return;

      const row = visit.toJSON() as chatAccess.VisitChatRow;
      const hostUserId = await chatAccess.loadHostUserId(row.assigned_host_id);
      try {
        chatAccess.assertCanAccessVisitChat(Number(u?.id), u?.roles ?? [], u?.office_id, row, hostUserId);
        socket.join(`visit_${vid}`);
        logger.debug({ socketId: socket.id, userId, visitId: vid }, 'Socket joined visit room');
      } catch {
        logger.warn({ socketId: socket.id, userId, visitId: vid }, 'Denied unauthorized visit room join');
      }
    });

    socket.on('leave_visit', (visitId: number | string) => {
      const vid = Number(visitId);
      socket.leave(`visit_${vid}`);
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id, userId }, '🔴 WebSocket client disconnected');
    });
  });

  // Activate the domain event bridge
  bridgeEventBus(io);

  return io;
};
