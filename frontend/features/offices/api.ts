import { apiClient } from '@shared/lib/api-client';
import type { CreateOfficePayload, Office } from './types';

export const officesApi = {
  async list(params: { page?: number; limit?: number; q?: string; include_archived?: boolean } = {}) {
    const response = await apiClient.get('/offices', {
      params: {
        page: params.page,
        limit: params.limit,
        q: params.q,
        include_archived: params.include_archived ? 'true' : 'false',
      }
    });
    const payload = response.data;
    return (payload.data || []) as Office[];
  },

  async create(payload: CreateOfficePayload) {
    const response = await apiClient.post('/offices', payload);
    return response.data.data as Office;
  },
};
