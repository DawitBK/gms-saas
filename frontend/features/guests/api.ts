import { apiClient } from '@shared/lib/api-client';
import type { GuestProfile, UpdateGuestProfileInput } from './types';

export const guestsApi = {
  async me() {
    try {
      const response = await apiClient.get('/guests/me');
      return response.data.data as GuestProfile;
    } catch (err: any) {
      if (err?.response?.status === 401) {
        throw new Error('Your session has expired. Please log in again.');
      }
      const message = err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Failed to load guest profile';
      throw new Error(message);
    }
  },

  async updateMe(payload: UpdateGuestProfileInput) {
    const response = await apiClient.patch('/guests/me', payload);
    return response.data.data as GuestProfile;
  },

  async list(params?: { page?: number; limit?: number; q?: string; filter?: string }) {
    const response = await apiClient.get('/guests', {
      params: {
        page: params?.page,
        limit: params?.limit,
        q: params?.q,
        filter: params?.filter,
      }
    });
    return response.data as { data: GuestProfile[]; meta: { total: number; page: number; limit: number; totalPages: number } };
  },

  async getProfile(id: number) {
    const response = await apiClient.get(`/guests/${id}`);
    return response.data.data as GuestProfile;
  },
  
  async bulkImport(rows: any[]) {
    const response = await apiClient.post('/guests/bulk-import', { rows });
    return response.data.data;
  },
  async updateProfile(id: number, payload: Partial<GuestProfile>) {
    const response = await apiClient.patch(`/guests/${id}`, payload);
    return response.data.data as GuestProfile;
  },
};
