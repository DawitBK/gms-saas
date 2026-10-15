import { Router } from 'express';
import { VisitController } from './visit.controller';
import { requireRole, enforceOfficeScope } from '../../shared/middleware/rbac.middleware';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { authenticatedUserLimiter } from '../../shared/middleware/rateLimiter';
import { validateRequest } from '../../shared/middleware/validateRequest';
import {
  createVisitSchema,
  escalateVisitSchema,
  guestDecisionSchema,
  listVisitsQuerySchema,
  reassignVisitSchema,
  rescheduleVisitSchema,
  updateVisitStatusSchema,
  extendVisitSchema,
  submitFeedbackSchema,
} from './visit.schema';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { idempotencyMiddleware } from '../../shared/middleware/idempotency.middleware';
import { listVisitMessages, postVisitMessage } from '../messages/message.handlers';
import { postVisitMessageSchema } from '../messages/message.schema';
import { idParamSchema } from '../../core/utils/shared.schema';

const router = Router();
const controller = new VisitController();

// Deepest Security Constraints natively established
router.use(requireAuth, authenticatedUserLimiter); // Resolves JWT to populate req.user safely

// Endpoints bound heavily
router.get(
  '/', 
  validateRequest(listVisitsQuerySchema),
  asyncHandler(controller.list)
);

router.get(
  '/:id', 
  validateRequest(idParamSchema),
  asyncHandler(controller.getById)
);

router.get(
  '/:id/qr.png', 
  validateRequest(idParamSchema),
  asyncHandler(controller.downloadQrPng)
);

// Guests can perform idempotent explicit creations
router.post(
  '/', 
  idempotencyMiddleware, // Protect against Post repeats
  validateRequest(createVisitSchema), 
  enforceOfficeScope(), // Enforce boundaries isolating user queries natively
  asyncHandler(controller.create)
);

// Guest decision on reschedule/reassignment (accept or decline)
router.post(
  '/:id/guest-decision',
  validateRequest(idParamSchema.merge(guestDecisionSchema)),
  asyncHandler(controller.guestDecision)
);

router.get(
  '/:id/messages', 
  validateRequest(idParamSchema),
  asyncHandler(listVisitMessages)
);

router.post(
  '/:id/messages',
  validateRequest(idParamSchema.merge(postVisitMessageSchema)),
  asyncHandler(postVisitMessage)
);

// Advanced roles intercepting transitions securely
router.patch(
  '/:id/status', 
  requireRole(['admin', 'host', 'reception']), 
  validateRequest(idParamSchema.merge(updateVisitStatusSchema)), 
  asyncHandler(controller.updateState)
);

router.post(
  '/:id/reschedule',
  requireRole(['admin', 'host', 'reception']),
  validateRequest(idParamSchema.merge(rescheduleVisitSchema)),
  asyncHandler(controller.reschedule)
);

router.post(
  '/:id/reassign',
  requireRole(['admin', 'host', 'reception']),
  validateRequest(idParamSchema.merge(reassignVisitSchema)),
  asyncHandler(controller.reassign)
);

router.post(
  '/:id/escalate',
  requireRole(['admin', 'host', 'reception']),
  validateRequest(idParamSchema.merge(escalateVisitSchema)),
  asyncHandler(controller.escalate)
);

router.post(
  '/:id/extend',
  requireRole(['admin', 'host', 'reception']),
  validateRequest(idParamSchema.merge(extendVisitSchema)),
  asyncHandler(controller.extend)
);

router.post(
  '/:id/feedback',
  requireRole(['guest']),
  validateRequest(idParamSchema.merge(submitFeedbackSchema)),
  asyncHandler(controller.submitFeedback)
);

router.delete(
  '/:id',
  requireRole(['admin', 'super_admin']),
  validateRequest(idParamSchema),
  asyncHandler(controller.archive)
);

router.post(
  '/:id/restore',
  requireRole(['admin', 'super_admin']),
  validateRequest(idParamSchema),
  asyncHandler(controller.restore)
);

router.post(
  '/:id/regenerate-qr',
  requireRole(['admin', 'reception', 'super_admin', 'super_reception']),
  validateRequest(idParamSchema),
  asyncHandler(controller.regenerateQr)
);

export default router;
