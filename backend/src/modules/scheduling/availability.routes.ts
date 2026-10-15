import { Router } from "express";
import { AvailabilityController } from "./availability.controller";
import { asyncHandler } from "../../core/utils/asyncHandler";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { authenticatedUserLimiter } from "../../shared/middleware/rateLimiter";
import { requireRole } from "../../shared/middleware/rbac.middleware";
import { validateRequest } from "../../shared/middleware/validateRequest";
import {
  availabilityRuleParamsSchema,
  availabilityRuleSchema,
  hostBoardQuerySchema,
  listTimeSlotsQuerySchema,
  updateAvailabilityRuleSchema,
} from "./availability.schema";

const router = Router();
const controller = new AvailabilityController();

// Public endpoint: GET /api/v1/availability/time_slots?office_id=&service_id=&date=YYYY-MM-DD
router.get(
  "/time_slots",
  validateRequest(listTimeSlotsQuerySchema),
  asyncHandler(controller.listTimeSlots),
);
router.use(requireAuth, authenticatedUserLimiter);
router.get(
  "/host-board",
  requireRole(["admin", "host", "reception"]),
  validateRequest(hostBoardQuerySchema),
  asyncHandler(controller.getHostBoard),
);
router.post(
  "/rules",
  requireRole(["host", "super_admin"]),
  validateRequest(availabilityRuleSchema),
  asyncHandler(controller.createRule),
);
router.patch(
  "/rules/:id",
  requireRole(["host", "super_admin"]),
  validateRequest(updateAvailabilityRuleSchema),
  asyncHandler(controller.updateRule),
);
router.delete(
  "/rules/:id",
  requireRole(["host", "super_admin"]),
  validateRequest(availabilityRuleParamsSchema),
  asyncHandler(controller.deleteRule),
);
router.delete(
  "/time_slots/:id",
  requireRole(["host", "super_admin"]),
  validateRequest(availabilityRuleParamsSchema),
  asyncHandler(controller.deleteTimeSlot),
);

export default router;
