import { apiClient } from '@shared/lib/api-client';
import type { Visit } from '@features/visits/types';

export interface VisitApproval {
  id: number | null;
  visit_id: number | null;
  approver_id: number | null;
  approver: { id: number | null; full_name: string | null; email: string | null } | null;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export const approvalsApi = {
  /**
   * The approval history for a visit — every decision, who made it, when, and
   * the reason given for a decline.
   *
   * `GET /approvals/visit/:visitId` has existed for as long as the module has,
   * and nothing in this app had ever called it: the UI could record a decision
   * and then never show it back. That left a host who declined a visit, and
   * the receptionist reading the visit afterwards, with no way to see why —
   * the reason was captured, stored, and invisible.
   */
  async listForVisit(visitId: number) {
    const response = await apiClient.get(`/approvals/visit/${visitId}`);
    return response.data.data as VisitApproval[];
  },

  async decideVisit(visitId: number, decision: 'APPROVED' | 'DECLINED', reason?: string) {
    const response = await apiClient.post(`/approvals/visit/${visitId}/decision`, {
      decision,
      ...(reason ? { reason } : {}),
    });
    return response.data.data as {
      approval: unknown;
      visit: Visit;
    };
  },
};
