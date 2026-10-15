import { apiClient } from '@shared/lib/api-client';
import type { AvailabilityBoard } from './types';
import type { DateRangeValue } from '@shared/lib/roles';

type AvailabilityRulePayload = {
  host_id?: number | string;
  office_id?: number | string;
  recurrence_type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'DATE_OVERRIDE';
  day_of_week?: number | string;
  day_of_month?: number | string;
  specific_date?: string;
  start_time: string;
  end_time: string;
  is_available?: boolean;
  label?: string;
  notes?: string;
  horizon_days?: number | string;
};

function normalizeNumericField(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeAvailabilityPayload(payload: AvailabilityRulePayload) {
  return {
    ...payload,
    ...(normalizeNumericField(payload.host_id) !== undefined
      ? { host_id: normalizeNumericField(payload.host_id) }
      : {}),
    ...(normalizeNumericField(payload.office_id) !== undefined
      ? { office_id: normalizeNumericField(payload.office_id) }
      : {}),
    ...(normalizeNumericField(payload.day_of_week) !== undefined
      ? { day_of_week: normalizeNumericField(payload.day_of_week) }
      : {}),
    ...(normalizeNumericField(payload.day_of_month) !== undefined
      ? { day_of_month: normalizeNumericField(payload.day_of_month) }
      : {}),
    ...(normalizeNumericField(payload.horizon_days) !== undefined
      ? { horizon_days: normalizeNumericField(payload.horizon_days) }
      : {}),
  };
}

export const availabilityApi = {
  async getBoard(params: { hostId?: number; dateRange?: DateRangeValue } = {}) {
    const response = await apiClient.get('/availability/host-board', {
      params: {
        ...(params.hostId ? { host_id: params.hostId } : {}),
        ...(params.dateRange?.startDate ? { start_date: params.dateRange.startDate } : {}),
        ...(params.dateRange?.endDate ? { end_date: params.dateRange.endDate } : {}),
      },
    });
    return response.data.data as AvailabilityBoard;
  },

  async createRule(payload: AvailabilityRulePayload) {
    const response = await apiClient.post(
      '/availability/rules',
      normalizeAvailabilityPayload(payload),
    );
    return response.data.data as AvailabilityBoard;
  },

  async updateRule(
    id: number,
    payload: Partial<AvailabilityRulePayload>
  ) {
    const response = await apiClient.patch(
      `/availability/rules/${id}`,
      normalizeAvailabilityPayload(payload as AvailabilityRulePayload),
    );
    return response.data.data as AvailabilityBoard;
  },

  async deleteRule(id: number) {
    const response = await apiClient.delete(`/availability/rules/${id}`);
    return response.data.data as AvailabilityBoard;
  },

  async deleteTimeSlot(id: number) {
    const response = await apiClient.delete(`/availability/time_slots/${id}`);
    return response.data.data as AvailabilityBoard;
  },
};
