import { Router } from 'express';
import { ApprovalController } from './approval.controller';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { requireRole } from '../../shared/middleware/rbac.middleware';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { approvalDecisionSchema } from './approval.schema';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { authenticatedUserLimiter, criticalActionLimiter } from '../../shared/middleware/rateLimiter';
import { z } from 'zod';

const router = Router();
const controller = new ApprovalController();

router.use(requireAuth, authenticatedUserLimiter);

const approvalVisitParamSchema = z.object({
  params: z.object({
    visitId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

/**
 * No requireRole here, deliberately — scoping is the service's job on this one.
 *
 * This used to be `requireRole(['admin','host','reception'])`, which made the
 * approval-history panel unreachable by construction: the panel is mounted on
 * /dashboard/visits/[id], and /dashboard/* is the GUEST portal, so the only
 * role that can open the page was the only role this route refused. Every
 * guest looking at their own visit got a 403 behind that panel.
 *
 * Removing the gate widens nothing, because it was never what enforced access.
 * listVisitApprovals() calls visitService.getVisitForActor(), which runs the
 * visit module's own scope policy and throws 403/404 itself — office scope for
 * admin and reception, assignment for hosts, and `visit.guest_id === actor.id`
 * for everyone else. That policy is strictly narrower than this role list was:
 * it is what stops one receptionist reading another office's decline reasons,
 * which the role check alone did not do.
 *
 * The POST below keeps its role gate. Reading the history of your own visit
 * and deciding an approval are different privileges.
 */
router.get(
  '/visit/:visitId',
  validateRequest(approvalVisitParamSchema),
  asyncHandler(controller.listForVisit),
);
router.post(
  '/visit/:visitId/decision',
  requireRole(['admin', 'host', 'reception']),
  criticalActionLimiter,
  validateRequest(approvalDecisionSchema),
  asyncHandler(controller.decide)
);

export default router;
