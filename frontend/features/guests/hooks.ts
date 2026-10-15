import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { guestsApi } from './api';
import { useRoleContext } from '@shared/hooks/useRoleContext';
import { GuestProfile } from './types';

export const useGuestProfile = () => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['guest-profile', scopeKey],
    queryFn: () => guestsApi.me(),
  });
};

export const useUpdateGuestProfile = () => {
  const queryClient = useQueryClient();
  const { scopeKey } = useRoleContext();

  return useMutation({
    mutationFn: guestsApi.updateMe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-profile', scopeKey] });
    },
  });
};

export const useGuestsList = (params?: { page?: number; limit?: number; q?: string; filter?: string }) => {
  return useQuery({
    queryKey: ['guests', params],
    queryFn: () => guestsApi.list(params),
  });
};
export const useUpdateGuest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: number; data: Partial<GuestProfile> }) =>
      guestsApi.updateProfile(payload.id, payload.data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["guest-detail", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["guests"] });
    },
  });
};
