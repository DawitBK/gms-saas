import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { visitMessagesApi } from './api';

export const visitMessagesQueryKey = (visitId: number) => ['visit-messages', visitId] as const;

export function useVisitMessages(visitId: number | null) {
  return useQuery({
    queryKey: visitId ? visitMessagesQueryKey(visitId) : ['visit-messages', 'none'],
    queryFn: async () => {
      if (!visitId) return [];
      const res = await visitMessagesApi.list(visitId);
      return res.data;
    },
    enabled: Boolean(visitId && visitId > 0),
  });
}

export function useSendVisitMessage(visitId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      if (!visitId) throw new Error('Missing visit');
      const res = await visitMessagesApi.send(visitId, content);
      return res.data;
    },
    onSuccess: () => {
      if (visitId) {
        void queryClient.invalidateQueries({ queryKey: visitMessagesQueryKey(visitId) });
      }
    },
  });
}
