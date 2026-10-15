import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { availabilityApi } from './api';
import type { DateRangeValue } from '@shared/lib/roles';

export const useAvailabilityBoard = (dateRange: DateRangeValue, hostId?: number) =>
  useQuery({
    queryKey: ['availability-board', hostId ?? null, dateRange.startDate ?? null, dateRange.endDate ?? null],
    queryFn: () => availabilityApi.getBoard({ hostId, dateRange }),
    enabled: Boolean(hostId),
  });

export const useCreateAvailabilityRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: availabilityApi.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-board'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'time-slots'] });
    },
  });
};

export const useUpdateAvailabilityRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof availabilityApi.updateRule>[1] }) =>
      availabilityApi.updateRule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-board'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'time-slots'] });
    },
  });
};

export const useDeleteAvailabilityRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => availabilityApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-board'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'time-slots'] });
    },
  });
};

export const useDeleteTimeSlot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => availabilityApi.deleteTimeSlot(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-board'] });
      queryClient.invalidateQueries({ queryKey: ['catalog', 'time-slots'] });
    },
  });
};
