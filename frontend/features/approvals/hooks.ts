import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from './api';
import { useRoleContext } from '@shared/hooks/useRoleContext';

/** Approval history for one visit — see approvalsApi.listForVisit. */
export const useVisitApprovals = (visitId: number | null) => {
  const { scopeKey } = useRoleContext();

  return useQuery({
    queryKey: ['visit-approvals', scopeKey, visitId],
    queryFn: () => approvalsApi.listForVisit(visitId!),
    enabled: visitId !== null && Number.isFinite(visitId),
    // The endpoint is office-scoped and returns 403/404 for a visit outside
    // the caller's scope; retrying that is pointless noise.
    retry: false,
  });
};

export const useVisitDecision = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ visitId, decision, reason }: { visitId: number; decision: 'APPROVED' | 'DECLINED'; reason?: string }) =>
      approvalsApi.decideVisit(visitId, decision, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] });
      // Newly recorded decision has to show up in the history panel.
      queryClient.invalidateQueries({ queryKey: ['visit-approvals'] });
    },
  });
};
