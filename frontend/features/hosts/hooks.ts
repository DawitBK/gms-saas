import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hostsApi } from './api';

export const useHosts = (params: { officeId?: number; departmentId?: number; activeOn?: string; userId?: number; page?: number; limit?: number; q?: string; roles?: string[] } = {}) =>
  useQuery({
    queryKey: ['hosts', params],
    queryFn: () => hostsApi.list(params),
  });

export const useUpdateHostServices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, serviceIds }: { id: number; serviceIds: number[] }) =>
      hostsApi.updateServices(id, serviceIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
};
