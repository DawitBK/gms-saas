import { ApprovalDecisionStatus } from '../../shared/domain/status-catalog';

export interface ApprovalDecisionInput {
  decision: ApprovalDecisionStatus;
  reason?: string;
}

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const mapApprovalToDTO = (approval: any) => ({
  id: toNumberOrNull(approval.id),
  visit_id: toNumberOrNull(approval.visit_id),
  approver_id: toNumberOrNull(approval.approver_id),
  // findByVisitId has always eager-loaded the approver, and this mapper threw
  // it away — leaving `approver_id: 47`, which is not something anyone reading
  // an approval history can use. The whole point of the record is WHO decided.
  approver: approval.approver
    ? {
        id: toNumberOrNull(approval.approver.id),
        full_name: approval.approver.full_name ?? null,
        email: approval.approver.email ?? null,
      }
    : null,
  status: approval.status,
  reason: approval.reason ?? null,
  created_at: approval.created_at,
  updated_at: approval.updated_at,
});
