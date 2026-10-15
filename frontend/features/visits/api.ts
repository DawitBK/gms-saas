import { apiClient } from "@shared/lib/api-client";
import { Visit } from "./types";

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary?: Record<string, number>;
  stats?: {
    summary: Record<string, number>;
    statusDistribution: Array<{
      status: string;
      count: number;
      percent: number;
    }>;
    dailyTrend: Array<{
      day: string;
      count: number;
    }>;
  };
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginatedMeta;
}

export const visitsApi = {
  async list(params: {
    page: number;
    limit: number;
    status?: string;
    status_group?: string;
    id?: number;
    guest_id?: number;
    host_id?: number;
    date?: string;
    q?: string;
    hasHost?: string;
    has_credential?: string;
    hasCredential?: string;
    expiring_soon?: string;
    expiringSoon?: string;
  }): Promise<PaginatedResponse<Visit>> {
    const response = await apiClient.get("/visits", {
      params: {
        page: params.page,
        limit: params.limit,
        status: params.status,
        status_group: params.status_group,
        id: params.id,
        guest_id: params.guest_id,
        host_id: params.host_id,
        date: params.date,
        // Search and filtering
        q: params.q,
        hasHost: params.hasHost,
        has_credential: params.has_credential,
        hasCredential: params.hasCredential,
        expiring_soon: params.expiring_soon,
        expiringSoon: params.expiringSoon,
      },
    });

    const { data, meta } = response.data as { data: Visit[]; meta: PaginatedMeta };

    return {
      success: true,
      data: data || [],
      meta: {
        total: Number(meta?.total ?? 0),
        page: Number(meta?.page ?? params.page),
        limit: Number(meta?.limit ?? params.limit),
        totalPages: Number(meta?.totalPages ?? 1),
        summary: meta?.summary || meta?.stats?.summary,
        stats: meta?.stats,
      },
    };
  },

  async getById(id: number): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.get(`/visits/${id}`);
    return response.data;
  },

  async updateStatus(
    id: number,
    status: string,
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.patch(`/visits/${id}/status`, { status });
    return response.data as { success: boolean; data: Visit };
  },

  async reschedule(
    id: number,
    payload: { time_slot_id: number; note?: string },
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/reschedule`, payload);
    return response.data as { success: boolean; data: Visit };
  },

  async reassign(
    id: number,
    payload: { host_id: number; time_slot_id?: number; note?: string },
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/reassign`, payload);
    return response.data as { success: boolean; data: Visit };
  },

  async escalate(
    id: number,
    payload: { reason?: string; target_host_id?: number },
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/escalate`, payload);
    return response.data as { success: boolean; data: Visit };
  },

  async checkInVisit(payload: {
    qrCode: string;
    manualOverride?: boolean;
    verificationMetadata?: {
      method: 'QR' | 'ID_SCAN' | 'MANUAL';
      verified: boolean;
      notes?: string;
    };
  }): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post("/checkin", {
      qr_code: payload.qrCode,
      ...(payload.manualOverride ? { manual_override: true } : {}),
      ...(payload.verificationMetadata ? { verification_metadata: payload.verificationMetadata } : {}),
    });
    return response.data as { success: boolean; data: Visit };
  },

  async create(
    data: {
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
    },
    // Opt-in `Idempotency-Key`: the server replays the first response for the
    // same key + body instead of booking twice (see useCreateVisit).
    idempotencyKey?: string,
  ): Promise<Visit> {
    const response = await apiClient.post("/visits", data, {
      ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
    });
    // Normalize API envelope: treat `success: false` as an error so callers
    // receive it in mutation `onError` rather than `onSuccess`.
    if (!response.data || response.data.success === false) {
      const err: any = new Error(response.data?.error?.message ?? "API error");
      err.response = { data: response.data, status: response.status };
      throw err;
    }

    // Return the Visit object directly for easier consumption by callers
    return response.data.data as Visit;
  },

  async guestDecision(
    id: number,
    decision: "ACCEPTED" | "DECLINED",
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/guest-decision`, {
      decision,
    });
    return response.data as { success: boolean; data: Visit };
  },

  async extend(
    id: number,
    payload: { new_end_time: string },
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/extend`, payload);
    return response.data as { success: boolean; data: Visit };
  },

  async submitFeedback(
    id: number,
    payload: { rating: number; comment?: string },
  ): Promise<{ success: boolean }> {
    const response = await apiClient.post(`/visits/${id}/feedback`, payload);
    return response.data as { success: boolean };
  },

  async manualCheckin(
    visitId: number,
    notes?: string
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post("/checkin/manual", {
      visitId,
      notes,
    });
    return response.data as { success: boolean; data: Visit };
  },
  
  async regenerateQr(
    id: number
  ): Promise<{ success: boolean; data: Visit }> {
    const response = await apiClient.post(`/visits/${id}/regenerate-qr`);
    return response.data as { success: boolean; data: Visit };
  },
};
