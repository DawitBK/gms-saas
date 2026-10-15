import { useQuery } from '@tanstack/react-query';
import { catalogApi } from './api';
import { QC } from '@shared/lib/query-config';

export const useOffices = (params: { page?: number; limit?: number; q?: string; include_archived?: boolean } = {}) =>
  useQuery({
    queryKey: ['catalog', 'offices', params],
    queryFn: () => catalogApi.listOffices(params),
    ...QC.STATIC,
  });

export const useServices = (officeId?: number, params: { page?: number; limit?: number; q?: string } = {}) =>
  useQuery({
    queryKey: ['catalog', 'services', officeId ?? 'all', params],
    queryFn: () => catalogApi.listServices({ officeId, ...params }),
  });

export const useDepartments = (officeId?: number, params: { page?: number; limit?: number; q?: string } = {}) =>
  useQuery({
    queryKey: ['catalog', 'departments', officeId ?? 'all', params],
    queryFn: () => catalogApi.listDepartments({ officeId, ...params }),
  });

export const useTimeSlots = (payload: {
  officeId?: number;
  serviceId?: number;
  departmentId?: number;
  date: string;
  hostId?: number;
}) =>
  useQuery({
    queryKey: [
      'catalog',
      'time-slots',
      payload.officeId ?? null,
      payload.serviceId ?? null,
      payload.departmentId ?? null,
      payload.hostId ?? null,
      payload.date,
    ],
    queryFn: () =>
      catalogApi.listTimeSlots({
        officeId: payload.officeId!,
        serviceId: payload.serviceId,
        departmentId: payload.departmentId,
        date: payload.date,
        hostId: payload.hostId,
      }),
    enabled: Boolean(payload.officeId && payload.date && (payload.serviceId || payload.departmentId)),
    refetchInterval: QC.VISITS.refetchInterval,
  });
