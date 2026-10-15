import { Router } from "express";
import { HostController } from "./host.controller";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { authenticatedUserLimiter } from "../../shared/middleware/rateLimiter";
import { requireRole } from "../../shared/middleware/rbac.middleware";
import { asyncHandler } from "../../core/utils/asyncHandler";
import { validateRequest } from "../../shared/middleware/validateRequest";
import {
  collectionQuerySchema,
  idParamSchema,
} from "../../core/utils/shared.schema";
import { z } from "zod";

const router = Router();
const controller = new HostController();
const listHostsQuerySchema = collectionQuerySchema.merge(
  z.object({
    query: z
      .object({
        user_id: z.coerce.number().int().positive().optional(),
        active_on: z.string().optional(),
      })
      .passthrough(),
  }),
);

router.use(requireAuth, authenticatedUserLimiter);

router.get(
  "/",
  requireRole([
    "admin",
    "reception",
    "host",
    "super_host",
    "super_reception",
    "super_admin",
  ]),
  validateRequest(listHostsQuerySchema),
  asyncHandler(controller.list),
);
router.get(
  "/:id",
  requireRole([
    "admin",
    "reception",
    "host",
    "super_host",
    "super_reception",
    "super_admin",
  ]),
  validateRequest(idParamSchema),
  asyncHandler(controller.get),
);
router.put(
  "/:id/services",
  requireRole(["admin", "super_admin"]),
  validateRequest(
    idParamSchema.merge(
      z.object({ body: z.object({ service_ids: z.array(z.coerce.number()) }) }),
    ),
  ),
  asyncHandler(controller.updateServices),
);

// Add services to a host (idempotent)
router.post(
  "/:id/services/add",
  requireRole(["admin", "super_admin"]),
  validateRequest(
    idParamSchema.merge(
      z.object({ body: z.object({ service_ids: z.array(z.coerce.number()) }) }),
    ),
  ),
  asyncHandler(controller.addServices),
);

// Remove services from a host — by serviceId param
router.delete(
  "/:id/services/:serviceId",
  requireRole(["admin", "super_admin"]),
  validateRequest(
    idParamSchema.merge(
      z.object({
        params: z.object({ serviceId: z.coerce.number().int().positive() }),
      }),
    ),
  ),
  asyncHandler(controller.removeServices),
);

// Remove services from a host — by body (list of service IDs)
router.delete(
  "/:id/services",
  requireRole(["admin", "super_admin"]),
  validateRequest(
    idParamSchema.merge(
      z.object({ body: z.object({ service_ids: z.array(z.coerce.number()) }) }),
    ),
  ),
  asyncHandler(controller.removeServices),
);

export default router;
