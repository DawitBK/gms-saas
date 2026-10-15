'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuthStore } from '@state/auth.store';
import { resolveSocketUrl } from '@shared/lib/runtime-origin';
import { isHostRole, isReceptionRole } from '@shared/lib/roles';
import { Socket } from 'socket.io-client';

const JOIN_OFFICE_EVENT = 'gms:join-office';
const JOIN_VISIT_EVENT = 'gms:join-visit';
const LEAVE_VISIT_EVENT = 'gms:leave-visit';
const SOCKET_EVENT_EVENT = 'gms:socket-event';

interface DomainEventPayload {
  type: string;
  metadata: {
    entity_id: number | string;
    office_id?: number | string;
    actor_id?: number | string;
    timestamp: string | Date;
    waiting_since?: string | Date;
    before?: any;
    after?: any;
  };
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * RealtimeBridge
 * 
 * Orchestrates the secure WebSocket connection and stabilizes it against 
 * rapid UI navigation or state changes.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((state) => state.hydrated);
  const selectedRole = useAuthStore((state) => state.selectedRole);
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = useAuthStore((state) => state.userId);

  // Use refs to provide the latest context to event handlers without triggering a full socket reconnect
  const contextRef = useRef({ pathname, userId, selectedRole });
  useEffect(() => {
    contextRef.current = { pathname, userId, selectedRole };
  }, [pathname, userId, selectedRole]);

  useEffect(() => {
    if (!hydrated || !accessToken || !userId) return;

    let socket: Socket | undefined;
    const joinedOfficeIds = new Set<number>();
    const joinedVisitIds = new Set<number>();

    const joinOffice = (officeId: number) => {
      if (!Number.isFinite(officeId) || officeId <= 0 || joinedOfficeIds.has(officeId)) return;
      socket?.emit('join_office', officeId);
      joinedOfficeIds.add(officeId);
    };

    const joinVisitRoom = (visitId: number) => {
      if (!Number.isFinite(visitId) || visitId <= 0 || joinedVisitIds.has(visitId)) return;
      socket?.emit('join_visit', visitId);
      joinedVisitIds.add(visitId);
    };

    const leaveVisitRoom = (visitId: number) => {
      if (!Number.isFinite(visitId) || visitId <= 0) return;
      socket?.emit('leave_visit', visitId);
      joinedVisitIds.delete(visitId);
    };

    // FIX: these were previously declared inside `boot()`, so the cleanup
    // below could not reference the same function identity and
    // `removeEventListener` with a fresh closure was a silent no-op.
    // Declaring them here (outer effect scope) lets cleanup remove the exact
    // listeners that were added — only JOIN_OFFICE_EVENT was even attempted
    // before, and with the wrong reference; JOIN_VISIT_EVENT and
    // LEAVE_VISIT_EVENT leaked entirely. Since this effect re-runs whenever
    // accessToken changes (i.e. on every background token refresh, roughly
    // every 15 min), the leak compounded on every long-lived session.
    const onJoinOffice = (event: Event) => {
      const customEvent = event as CustomEvent<{ officeId?: number }>;
      const officeId = Number(customEvent.detail?.officeId);
      if (Number.isFinite(officeId) && officeId > 0) joinOffice(officeId);
    };

    const onJoinVisit = (event: Event) => {
      const customEvent = event as CustomEvent<{ visitId?: number }>;
      const visitId = Number(customEvent.detail?.visitId);
      if (Number.isFinite(visitId) && visitId > 0) joinVisitRoom(visitId);
    };

    const onLeaveVisit = (event: Event) => {
      const customEvent = event as CustomEvent<{ visitId?: number }>;
      const visitId = Number(customEvent.detail?.visitId);
      if (Number.isFinite(visitId) && visitId > 0) leaveVisitRoom(visitId);
    };

    window.addEventListener(JOIN_OFFICE_EVENT, onJoinOffice as EventListener);
    window.addEventListener(JOIN_VISIT_EVENT, onJoinVisit as EventListener);
    window.addEventListener(LEAVE_VISIT_EVENT, onLeaveVisit as EventListener);

    const boot = async () => {
      const socketUrl = resolveSocketUrl();
      const socketPath = process.env.NEXT_PUBLIC_SOCKET_PATH ?? '/socket.io';
      const { io } = await import('socket.io-client');

      socket = io(socketUrl, {
        path: socketPath,
        auth: { token: accessToken },
        transports: ['websocket', 'polling'], // Allow fallback to polling if websocket fails
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        logger.info('WebSocket connected successfully');
        const decoded = decodeJwtPayload(accessToken);
        const tokenOfficeId = Number(decoded?.office_id);
        if (Number.isFinite(tokenOfficeId) && tokenOfficeId > 0) {
          joinOffice(tokenOfficeId);
        }
      });

      socket.on('connect_error', (err) => {
        logger.warn({ err: err.message }, 'WebSocket connection error - likely auth or server restart');
      });

      socket.on('notification', (payload: any) => {
        const title = payload?.metadata?.after?.title ?? 'Notification';
        const message = payload?.metadata?.after?.message ?? '';
        toast(`${title}${message ? ` - ${message}` : ''}`);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['visits'] });
      });

      socket.on('domain_event', (payload: DomainEventPayload) => {
        const { type, metadata } = payload;
        const { pathname: currentPath, userId: currentUserId, selectedRole: currentRole } = contextRef.current;
        
        window.dispatchEvent(new CustomEvent(SOCKET_EVENT_EVENT, { detail: payload }));

        if (type.startsWith('VISIT.')) {
          queryClient.invalidateQueries({ queryKey: ['visits'] });
          queryClient.invalidateQueries({ queryKey: ['visit-detail'] });
          queryClient.invalidateQueries({ queryKey: ['operations-dashboard'] });
          // Also invalidate all operations-dashboard queries with any scopeKey
          queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'operations-dashboard' });
        }

        if (type === 'MESSAGE.SENT' && metadata.entity_id) {
          queryClient.invalidateQueries({ queryKey: ['visit-messages', Number(metadata.entity_id)] });
        }

        if (type === 'VISIT.SLA_ESCALATED') {
          const waitingSince = metadata.waiting_since ? new Date(metadata.waiting_since) : null;
          const waitMinutes = waitingSince ? Math.floor((Date.now() - waitingSince.getTime()) / 60000) : 15;
          
          toast.warning(`Visit Needs Attention`, {
            description: 'Visit has been escalated to reception for immediate coordination.',
            action: {
              label: "Open Queue",
              onClick: () => router.push("/reception/visits?status=ESCALATED"),
            },
            duration: Infinity,
          });
        }

        if (type === 'VISIT.CHECKED_IN') {
          const isOwnAction = Number(metadata.actor_id) === currentUserId;
          const isReceptionView = currentPath?.includes('/checkin');

          if (!isOwnAction || !isReceptionView) {
            if (isHostRole(currentRole ?? '')) {
              toast.success('Your guest has arrived and is checked in.', {
                action: { label: "View Visits", onClick: () => router.push("/host/visits") },
              });
            } else if (isReceptionRole(currentRole ?? '')) {
              toast.success('Guest arrival recorded.', {
                action: { label: "Open Check-in", onClick: () => router.push("/reception/checkin") },
              });
            }
          }
        }
      });
    };

    void boot();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      window.removeEventListener(JOIN_OFFICE_EVENT, onJoinOffice as EventListener);
      window.removeEventListener(JOIN_VISIT_EVENT, onJoinVisit as EventListener);
      window.removeEventListener(LEAVE_VISIT_EVENT, onLeaveVisit as EventListener);
    };
  }, [hydrated, accessToken, userId, queryClient, router]); // Stable dependencies: reconnect only if auth identity changes

  return null;
}

// Minimal internal logger for the bridge
const logger = {
  info: (..._args: any[]) => undefined,
  warn: (..._args: any[]) => undefined,
};
