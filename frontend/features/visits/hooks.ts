import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { visitsApi } from "./api";
import { Visit } from "./types";
import { useRoleContext } from "@shared/hooks/useRoleContext";

export const useVisitsList = (params: {
  page: number;
  limit: number;
  status?: string;
  status_group?: string;
  hasHost?: string;
  id?: number;
  guest_id?: number;
  host_id?: number;
  date?: string;
  has_credential?: string;
  expiringSoon?: string;
  expiring_soon?: string;
  q?: string;
  sort_by?: string;
  sort_order?: string;
}) => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ["visits", scopeKey, params],
    queryFn: () => visitsApi.list(params),
  });
};

export const useVisitById = (id: number) => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ["visits", id, scopeKey],
    queryFn: () => visitsApi.getById(id),
    enabled: !!id,
  });
};

export const useUpdateVisitStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; status: string }) =>
      visitsApi.updateStatus(payload.id, payload.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
    },
  });
};

export const useRescheduleVisit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: number;
      time_slot_id: number;
      note?: string;
    }) =>
      visitsApi.reschedule(payload.id, {
        time_slot_id: payload.time_slot_id,
        note: payload.note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "time-slots"] });
    },
  });
};

export const useReassignVisit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: number;
      host_id: number;
      time_slot_id?: number;
      note?: string;
    }) =>
      visitsApi.reassign(payload.id, {
        host_id: payload.host_id,
        time_slot_id: payload.time_slot_id,
        note: payload.note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "time-slots"] });
    },
  });
};

export const useEscalateVisit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; reason?: string; target_host_id?: number }) =>
      visitsApi.escalate(payload.id, { 
        reason: payload.reason,
        target_host_id: payload.target_host_id
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
    },
  });
};

export const useCheckInVisit = () => {
  return useMutation({
    mutationFn: (payload: { 
      qrCode: string; 
      manualOverride?: boolean;
      verificationMetadata?: {
        method: 'QR' | 'ID_SCAN' | 'MANUAL';
        verified: boolean;
        notes?: string;
      };
    }) => visitsApi.checkInVisit(payload),
  });
};

/** A random v4 id for the `Idempotency-Key` header. `crypto.randomUUID` only
 *  exists in secure contexts (https/localhost); the internal server may be
 *  reached over plain http, so fall back to getRandomValues, then Math.random. */
const newIdempotencyKey = (): string => {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const useCreateVisit = () => {
  const queryClient = useQueryClient();
  // One key per submission attempt, per form. It is reused only when the same
  // payload is sent again after an attempt whose outcome is unknown (network
  // error or timeout, 5xx, or the 409 "already processing"), so the server can
  // replay the first booking instead of making a second. It is dropped after a
  // success, after any other 4xx (a definitive answer the server has cached),
  // and whenever the payload changes: the server answers 409 for a key reused
  // with a different body, which would block a corrected resubmit.
  const attempt = useRef<{ key: string; body: string } | null>(null);
  return useMutation({
    mutationFn: (data: {
      service_id?: number | null;
      department_id?: number | null;
      office_id: number;
      time_slot_id: number;
      host_id?: number;
      purpose?: string;
      guest_id?: number;
      guest_payload?: {
        full_name: string;
        email: string;
        phone?: string;
        company?: string;
      };
    }) => {
      const body = JSON.stringify(data);
      if (attempt.current?.body !== body) {
        attempt.current = { key: newIdempotencyKey(), body };
      }
      return visitsApi.create(data, attempt.current.key);
    },
    onSuccess: () => {
      attempt.current = null;
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["catalog", "time-slots"] });
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      if (status && status < 500 && status !== 409) attempt.current = null;
    },
  });
};

export const useGuestDecision = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; decision: "ACCEPTED" | "DECLINED" }) =>
      visitsApi.guestDecision(payload.id, payload.decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
    },
  });
};

export const useExtendVisit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; new_end_time: string }) =>
      visitsApi.extend(payload.id, { new_end_time: payload.new_end_time }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["operations-dashboard"] });
    },
  });
};

export const useSubmitFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; rating: number; comment?: string }) =>
      visitsApi.submitFeedback(payload.id, {
        rating: payload.rating,
        comment: payload.comment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visits"] });
      queryClient.invalidateQueries({ queryKey: ["visit-detail"] });
    },
  });
};
