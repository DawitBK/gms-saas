import { apiClient } from '@shared/lib/api-client';
import type { AdminUser } from './types';

function normalizeRoles(rawRoles: unknown): string[] {
  if (!Array.isArray(rawRoles)) return [];
  return rawRoles
    .map((role) => {
      if (typeof role === 'string') return role;
      if (role && typeof role === 'object' && 'name' in role) {
        const roleName = (role as { name?: unknown }).name;
        return typeof roleName === 'string' ? roleName : '';
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeUser(raw: any): AdminUser {
  const hostProfile = raw?.host ?? raw?.Host ?? null;
  return {
    id: Number(raw?.id ?? raw?.user_id ?? 0),
    full_name: raw?.full_name ?? raw?.fullName ?? raw?.name ?? 'No name on file',
    email: raw?.email ?? raw?.username ?? 'No email on file',
    phone: raw?.phone ?? raw?.phone_number ?? 'No phone on file',
    office_id:
      raw?.office_id != null
        ? Number(raw.office_id)
        : hostProfile?.office_id != null
          ? Number(hostProfile.office_id)
          : null,
    department_id:
      raw?.department_id != null
        ? Number(raw.department_id)
        : hostProfile?.department_id != null
          ? Number(hostProfile.department_id)
          : null,
    service_ids: Array.isArray(raw?.service_ids)
      ? raw.service_ids.map((id: unknown) => Number(id)).filter((id: number) => id > 0)
      : [],
    company: raw?.company ?? null,
    government_id: raw?.government_id ?? null,
    document_url: raw?.document_url ?? null,
    status: raw?.status ?? 'ACTIVE',
    presence: raw?.presence ?? 'OFFLINE',
    roles: normalizeRoles(raw?.roles),
  };
}

function normalizeMeta(rawMeta: any, fallback: { page: number; limit: number; total: number }) {
  const total = Number(rawMeta?.total ?? fallback.total);
  const page = Number(rawMeta?.page ?? fallback.page);
  const limit = Number(rawMeta?.limit ?? fallback.limit);
  const totalPages = Number(rawMeta?.totalPages ?? (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1));

  return { total, page, limit, totalPages };
}

export const adminApi = {
  async listUsers(params: { page?: number; limit?: number; showArchived?: boolean; q?: string; sort_by?: string; sort_order?: string } = { page: 1, limit: 20 }) {
    const response = await apiClient.get('/users', {
      params: { 
        page: params.page ?? 1, 
        limit: params.limit ?? 20,
        include_archived: params.showArchived ? 'true' : 'false',
        q: params.q,
        sort_by: params.sort_by,
        sort_order: params.sort_order,
      },
    });

    const { data, meta } = response.data as { data: any[]; meta: any };
    const users = (data || []).map(normalizeUser);

    return { 
      users, 
      meta: normalizeMeta(meta, {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        total: users.length,
      })
    };
  },

  async deleteUser(id: number) {
    await apiClient.delete(`/users/${id}`);
  },

  async restoreUser(id: number) {
    await apiClient.post(`/users/${id}/restore`);
  },

  async setUserRoles(payload: { id: number; roles: string[] }) {
    await apiClient.post(`/users/${payload.id}/roles`, { roles: payload.roles });
  },

  async updateUser(payload: {
    id: number;
    full_name?: string;
    email?: string;
    phone?: string;
    password?: string;
    roles?: string[];
    office_id?: number | null;
    department_id?: number | null;
    service_ids?: number[];
    replace_service_assignments?: boolean;
    active?: boolean;
    status?: 'ACTIVE' | 'INACTIVE';
    company?: string | null;
    government_id?: string | null;
    document_url?: string | null;
  }) {
    const { id, ...body } = payload;
    const response = await apiClient.patch(`/users/${id}`, body);
    return normalizeUser(response.data.data);
  },

  async createUser(payload: {
    full_name: string;
    email: string;
    phone: string;
    password: string;
    roles: string[];
    office_id?: number | null;
    department_id?: number | null;
    service_ids?: number[];
    replace_service_assignments?: boolean;
    active?: boolean;
    company?: string;
    government_id?: string;
    document_url?: string;
  }) {
    const response = await apiClient.post('/users', {
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      roles: payload.roles,
      ...(payload.office_id !== undefined ? { office_id: payload.office_id } : {}),
      ...(payload.department_id !== undefined ? { department_id: payload.department_id } : {}),
      ...(payload.service_ids ? { service_ids: payload.service_ids } : {}),
      ...(payload.replace_service_assignments !== undefined
        ? { replace_service_assignments: payload.replace_service_assignments }
        : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
      ...(payload.company ? { company: payload.company } : {}),
      ...(payload.government_id ? { government_id: payload.government_id } : {}),
      ...(payload.document_url ? { document_url: payload.document_url } : {}),
    });
    return normalizeUser(response.data.data);
  },

  async bulkImport(rows: any[]) {
    const response = await apiClient.post('/users/bulk-import', { rows });
    return response.data.data;
  },

  async bulkImportOrg(payload: { offices?: any[], departments?: any[], services?: any[] }) {
    const response = await apiClient.post('/operations/bulk-import-org', payload);
    return response.data.data;
  },

  async downloadOrgTemplate() {
    const response = await apiClient.get('/operations/bulk-template', {
      responseType: 'blob',
    });
    return response.data;
  },
};
