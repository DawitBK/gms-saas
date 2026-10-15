import { apiClient } from '@shared/lib/api-client';
import type { HostOption } from './types';

export const hostsApi = {
  async list(params: { officeId?: number; departmentId?: number; activeOn?: string; userId?: number; page?: number; limit?: number; q?: string; roles?: string[] } = {}) {
    const response = await apiClient.get('/hosts', {
      params: {
        office_id: params.officeId,
        department_id: params.departmentId,
        active_on: params.activeOn,
        user_id: params.userId,
        page: params.page,
        limit: params.limit ?? 2000,
        q: params.q,
        roles: params.roles,
      },
    });
    const payload = response.data;
    // Return paginated response object containing `data` and `meta`.
    return { data: (payload.data || []) as HostOption[], meta: payload.meta };
  },

  async getProfile(id: number) {
    const response = await apiClient.get(`/hosts/${id}`);
    return response.data.data as HostOption;
  },
  async updateServices(id: number, serviceIds: number[]) {
    const response = await apiClient.put(`/hosts/${id}/services`, {
      service_ids: serviceIds,
    });
    return response.data;
  },
};
