import { z } from 'zod';
import { APPROVAL_DECISION_STATUSES } from '../../shared/domain/status-catalog';

export const approvalDecisionSchema = z.object({
  params: z.object({
    visitId: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    decision: z.enum(APPROVAL_DECISION_STATUSES),
    reason: z.string().max(500).optional(),
  }),
});
