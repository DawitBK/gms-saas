import { apiClient } from "@shared/lib/api-client";
import type {
  BookingAvailabilityContext,
  DepartmentOption,
  OfficeOption,
  ServiceOption,
} from "./types";

export const catalogApi = {
  async listOffices(
    params: {
      page?: number;
      limit?: number;
      q?: string;
      include_archived?: boolean;
    } = {},
  ) {
    const response = await apiClient.get("/offices", {
      params: {
        page: params.page,
        limit: params.limit ?? 2000,
        q: params.q,
        include_archived: params.include_archived ? "true" : "false",
      },
    });
    // The backend returns { success, data: { data, meta } }
    // Or if standardized via helper: { success, data: [...], meta: {...} }
    // Let's assume standardized { data, meta } at top level of response.data
    const payload = response.data;
    return (payload.data || []) as OfficeOption[];
  },

  async listServices(
    params: {
      officeId?: number;
      page?: number;
      limit?: number;
      q?: string;
    } = {},
  ) {
    const response = await apiClient.get("/services", {
      params: {
        office_id: params.officeId,
        page: params.page,
        limit: params.limit ?? 2000,
        q: params.q,
      },
    });
    const payload = response.data;
    return (payload.data || []) as ServiceOption[];
  },

  async listDepartments(
    params: {
      officeId?: number;
      page?: number;
      limit?: number;
      q?: string;
    } = {},
  ) {
    const response = await apiClient.get("/departments", {
      params: {
        office_id: params.officeId,
        page: params.page,
        limit: params.limit ?? 2000,
        q: params.q,
      },
    });
    const payload = response.data;
    return (payload.data || []) as DepartmentOption[];
  },

  async listTimeSlots(payload: {
    officeId: number;
    serviceId?: number;
    departmentId?: number;
    date: string;
    hostId?: number;
  }) {
    const response = await apiClient.get("/availability/time_slots", {
      params: {
        office_id: payload.officeId,
        ...(payload.serviceId ? { service_id: payload.serviceId } : {}),
        ...(payload.departmentId
          ? { department_id: payload.departmentId }
          : {}),
        date: payload.date,
        ...(payload.hostId ? { host_id: payload.hostId } : {}),
      },
    });
    return response.data.data as BookingAvailabilityContext;
  },
};
