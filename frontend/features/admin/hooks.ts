import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './api';

export function useAdminUsers(params: { page?: number; limit?: number; showArchived?: boolean; q?: string; sort_by?: string; sort_order?: string } = { page: 1, limit: 20 }) {
  return useQuery({
    queryKey: ['admin-users', params],
    queryFn: () => adminApi.listUsers(params),
  });
}

export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.restoreUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
}

export function useSetUserRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.setUserRoles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.updateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
}

export function useCreateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
    },
  });
}
