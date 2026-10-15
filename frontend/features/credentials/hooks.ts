import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { credentialsApi } from './api';
import { useRoleContext } from '@shared/hooks/useRoleContext';

export const useVisitCredentials = (visitId: number | null) => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['visit-credentials', scopeKey, visitId],
    queryFn: () => credentialsApi.listVisitCredentials(visitId!),
    enabled: visitId !== null,
  });
};

export const useRevokeVisitCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ visitId, reason }: { visitId: number; reason?: string }) =>
      credentialsApi.revokeVisitCredential(visitId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visit-credentials'] });
    },
  });
};

export const useManualFallback = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (visitId: number) => credentialsApi.manualFallback(visitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      queryClient.invalidateQueries({ queryKey: ['visit-detail'] });
      queryClient.invalidateQueries({ queryKey: ['visit-credentials'] });
    },
  });
};
