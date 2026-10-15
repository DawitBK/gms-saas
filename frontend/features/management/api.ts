import { apiClient } from "@shared/lib/api-client";
import type {
  DepartmentPayload,
  ManagedDepartment,
  ManagedOffice,
  ManagedService,
  OfficePayload,
  ServicePayload,
} from "./types";

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ManagedServicesResponse {
  services: ManagedService[];
  meta: PaginatedMeta | null;
}

export const managementApi = {
  async listOffices(includeArchived = false) {
    const response = await apiClient.get("/offices", {
      params: { include_archived: includeArchived, limit: 2000 },
    });
    return response.data.data as ManagedOffice[];
  },

  async createOffice(payload: OfficePayload) {
    const response = await apiClient.post("/offices", payload);
    return response.data.data as ManagedOffice;
  },

  async updateOffice(id: number, payload: Partial<OfficePayload>) {
    const response = await apiClient.patch(`/offices/${id}`, payload);
    return response.data.data as ManagedOffice;
  },

  async archiveOffice(id: number) {
    const response = await apiClient.delete(`/offices/${id}`);
    return response.data.data as ManagedOffice;
  },

  async restoreOffice(id: number) {
    const response = await apiClient.post(`/offices/${id}/restore`);
    return response.data.data as ManagedOffice;
  },

  async listDepartments(officeId?: number, includeArchived = false) {
    const response = await apiClient.get("/departments", {
      params: {
        ...(officeId ? { office_id: officeId } : {}),
        include_archived: includeArchived,
        limit: 2000,
      },
    });
    return response.data.data as ManagedDepartment[];
  },

  async createDepartment(payload: DepartmentPayload) {
    const response = await apiClient.post("/departments", payload);
    return response.data.data as ManagedDepartment;
  },

  async updateDepartment(id: number, payload: Partial<DepartmentPayload>) {
    const response = await apiClient.patch(`/departments/${id}`, payload);
    return response.data.data as ManagedDepartment;
  },

  async deleteDepartment(id: number) {
    const response = await apiClient.delete(`/departments/${id}`);
    return response.data.data as { deleted: boolean };
  },

  async restoreDepartment(id: number) {
    const response = await apiClient.post(`/departments/${id}/restore`);
    return response.data.data as { restored: boolean };
  },

  async listServices(
    officeId?: number,
    includeArchived = false,
    search?: string,
  ) {
    const response = await apiClient.get("/services", {
      params: {
        ...(officeId ? { office_id: officeId } : {}),
        include_archived: includeArchived,
        q: search,
      },
    });
    return {
      services: response.data.data as ManagedService[],
      meta: null as PaginatedMeta | null,
    } as ManagedServicesResponse;
  },

  async listServicesPaginated(params: {
    officeId?: number;
    page: number;
    limit: number;
    includeArchived?: boolean;
  }) {
    const response = await apiClient.get("/services", {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.officeId ? { office_id: params.officeId } : {}),
        include_archived: params.includeArchived,
      },
    });

    const payload = response.data?.data;
    // FIX: pagination metadata lives in the response's own `meta` object,
    // not inside `data` (which is just the page's array of services) —
    // reading `payload?.total` off the array always fell back to
    // `services.length`, collapsing "total results" to "this page's count".
    const meta = response.data?.meta;
    const services = Array.isArray(payload)
      ? (payload as ManagedService[])
      : Array.isArray(payload?.data)
        ? (payload.data as ManagedService[])
        : [];
    const total = Number(meta?.total ?? services.length);
    const page = Number(meta?.page ?? params.page);
    const limit = Number(meta?.limit ?? params.limit);
    const totalPages = Number(
      meta?.totalPages ?? (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1),
    );

    return {
      services,
      meta: { total, page, limit, totalPages } as PaginatedMeta,
    } as ManagedServicesResponse;
  },

  async createService(payload: ServicePayload) {
    const response = await apiClient.post("/services", payload);
    return response.data.data as ManagedService;
  },

  async updateService(id: number, payload: Partial<ServicePayload>) {
    const response = await apiClient.patch(`/services/${id}`, payload);
    return response.data.data as ManagedService;
  },

  async deleteService(id: number) {
    const response = await apiClient.delete(`/services/${id}`);
    return response.data.data as { archived: boolean };
  },

  async restoreService(id: number) {
    const response = await apiClient.post(`/services/${id}/restore`);
    return response.data.data as { restored: boolean };
  },

  async deleteOffice(id: number) {
    const response = await apiClient.delete(`/offices/${id}`);
    return response.data.data as { deleted: boolean };
  },

  async listVisits(params: {
    page: number;
    limit: number;
    status?: string;
    office_id?: number;
  }) {
    const response = await apiClient.get("/visits", { params });
    return response.data;
  },

  async archiveVisit(id: number) {
    const response = await apiClient.delete(`/visits/${id}`);
    return response.data.data as { archived: boolean };
  },

  async restoreVisit(id: number) {
    const response = await apiClient.post(`/visits/${id}/restore`);
    return response.data.data as { restored: boolean };
  },
};
