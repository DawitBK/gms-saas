import { Router } from "express";
import { asyncHandler } from "../../core/utils/asyncHandler";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { requireRole } from "../../shared/middleware/rbac.middleware";
import { OperationsController } from "./operations.controller";
import { validateRequest } from "../../shared/middleware/validateRequest";
import { idParamSchema } from "../../core/utils/shared.schema";
import { z } from "zod";
import { authenticatedUserLimiter, criticalActionLimiter } from "../../shared/middleware/rateLimiter";

const router = Router();
const controller = new OperationsController();
const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val);

const reportsQuerySchema = z.object({
  query: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      officeId: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      departmentId: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      hostId: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      status: z.string().optional(),
    })
    .passthrough(),
});

const bulkImportValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const bulkImportOrgSchema = z.object({
  body: z
    .object({
      offices: z.array(z.record(z.string(), bulkImportValueSchema)).optional(),
      departments: z
        .array(z.record(z.string(), bulkImportValueSchema))
        .optional(),
      services: z.array(z.record(z.string(), bulkImportValueSchema)).optional(),
      hosts: z.array(z.record(z.string(), bulkImportValueSchema)).optional(),
    })
    .refine(
      (body) =>
        (body.offices?.length ?? 0) > 0 ||
        (body.departments?.length ?? 0) > 0 ||
        (body.services?.length ?? 0) > 0 ||
        (body.hosts?.length ?? 0) > 0,
      {
        message:
          "At least one office, department, service, or host row is required for bulk import",
      },
    ),
});

const seedRunParamSchema = z.object({
  params: z.object({
    runId: z.string().trim().uuid(),
  }),
});

const auditLogQuerySchema = z.object({
  query: z
    .object({
      entity: z.string().trim().optional(),
      action: z.string().trim().optional(),
      userId: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().optional(),
      ),
      limit: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().positive().max(100).optional(),
      ),
    })
    .passthrough(),
});

router.use(requireAuth, authenticatedUserLimiter);
router.get(
  "/dashboard",
  requireRole([
    "admin",
    "reception",
    "super_admin",
    "super_reception",
    "super_host",
  ]),
  asyncHandler(controller.getDashboard),
);
router.get(
  "/reports",
  requireRole([
    "admin",
    "host",
    "reception",
    "super_admin",
    "super_reception",
    "super_host",
  ]),
  validateRequest(reportsQuerySchema),
  asyncHandler(controller.getReports),
);
router.get(
  "/integrations",
  requireRole(["admin", "reception", "super_admin", "super_reception"]),
  asyncHandler(controller.getIntegrationHealth),
);
// Alias: the admin dashboard frontend requests /operations/integration-health for
// this same integration-health payload. Additive — the /integrations route is unchanged.
router.get(
  "/integration-health",
  requireRole(["admin", "reception", "super_admin", "super_reception"]),
  asyncHandler(controller.getIntegrationHealth),
);
router.post(
  "/integrations/outbox/:id/retry",
  requireRole(["admin"]),
  validateRequest(idParamSchema),
  asyncHandler(controller.retryOutboxEvent),
);
router.post(
  "/integrations/unifi-webhooks/:id/replay",
  requireRole(["admin"]),
  validateRequest(idParamSchema),
  asyncHandler(controller.replayUnifiWebhook),
);
router.post(
  "/seed",
  requireRole(["admin"]),
  asyncHandler(controller.seedSystem),
);
router.get(
  "/seed/:runId",
  requireRole(["admin"]),
  validateRequest(seedRunParamSchema),
  asyncHandler(controller.getSeedStatus),
);
router.get(
  "/bulk-template",
  requireRole(["admin"]),
  asyncHandler(controller.getBulkTemplate),
);
router.post(
  "/bulk-import-org",
  requireRole(["admin"]),
  criticalActionLimiter,
  validateRequest(bulkImportOrgSchema),
  asyncHandler(controller.bulkImportOrg),
);
router.get(
  "/audit-logs",
  requireRole(["admin"]),
  validateRequest(auditLogQuerySchema),
  asyncHandler(controller.getAuditLogs),
);

export default router;
