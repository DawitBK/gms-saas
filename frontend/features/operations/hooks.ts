import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { operationsApi } from './api';
import { useRoleContext } from '@shared/hooks/useRoleContext';
import { QC } from '@shared/lib/query-config';

export const useOperationsDashboard = () => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['operations-dashboard', scopeKey],
    queryFn: () => operationsApi.getDashboard(),
    refetchInterval: QC.DASHBOARD.refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: QC.DASHBOARD.staleTime,
  });
};

export const useIntegrationHealth = () => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['operations-integration-health', scopeKey],
    queryFn: () => operationsApi.getIntegrationHealth(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
};

export const useRetryOutboxEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => operationsApi.retryOutboxEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations-integration-health'] });
    },
  });
};

export const useReplayUnifiWebhook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => operationsApi.replayUnifiWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations-integration-health'] });
    },
  });
};
