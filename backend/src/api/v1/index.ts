import { Router } from 'express';
import authRoutes from '../../modules/auth/auth.routes';
import userRoutes from '../../modules/users/user.routes';
import visitRoutes from '../../modules/visits/visit.routes';
import officeRoutes from '../../modules/offices/office.routes';
import checkinRoutes from '../../modules/checkin/checkin.routes';
import departmentRoutes from '../../modules/departments/department.routes';
import serviceRoutes from '../../modules/services/service.routes';
import hostRoutes from '../../modules/hosts/host.routes';
import notificationRoutes from '../../modules/notifications/notification.routes';
import availabilityRoutes from '../../modules/scheduling/availability.routes';
import approvalRoutes from '../../modules/approvals/approval.routes';
import credentialRoutes from '../../modules/credentials/credential.routes';
import guestRoutes from '../../modules/guests/guest.routes';
import operationsRoutes from '../../modules/operations/operations.routes';
import unifiWebhookRoutes from '../../modules/unifi-webhooks/unifi-webhook.routes';
import ocrRoutes from '../../modules/ocr/ocr.routes';
import simulationRoutes from './simulation.routes';
import { metricsRegistry } from '../../shared/services/metrics.service';
import { appConfig } from '../../config/app.config';
import internalSsoRoutes from '../../modules/auth/internal-sso.routes';

const router = Router();

/**
 * GMS Enterprise v1 Routes
 * All domains mounted under /api/v1/
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      message: 'API is operational',
    },
    meta: {
      request_id: (res.req as any)?.requestId || null,
    },
  });
});

router.get('/metrics', async (_req, res) => {
  if (!appConfig.observability.metricsEnabled || !appConfig.metrics.publicRouteEnabled) {
    res.status(404).send('Metrics disabled');
    return;
  }

  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});

router.use('/auth', authRoutes);
router.use('/internal/sso', internalSsoRoutes);
router.use('/users', userRoutes);
router.use('/visits', visitRoutes);
router.use('/offices', officeRoutes);
router.use('/checkin', checkinRoutes);
router.use('/departments', departmentRoutes);
router.use('/services', serviceRoutes);
router.use('/hosts', hostRoutes);
router.use('/notifications', notificationRoutes);
router.use('/availability', availabilityRoutes);
router.use('/approvals', approvalRoutes);
router.use('/credentials', credentialRoutes);
router.use('/guests', guestRoutes);
router.use('/operations', operationsRoutes);
router.use('/integrations/unifi', unifiWebhookRoutes);
router.use('/ocr', ocrRoutes);
/**
 * Demo tooling — never mounted in production.
 *
 * POST /simulation/start spawn()s two Node child processes that inherit this
 * backend's entire `process.env` (database credentials, both JWT secrets, the
 * UniFi API key, the SendGrid key, the internal SSO shared secret), marks them
 * `detached`, and `unref`s them so they outlive the request that started them.
 * The router carried no auth middleware of any kind and was mounted
 * unconditionally, so on the live server that was an unauthenticated
 * process-spawn endpoint. Its Swagger annotation claims
 * `security: [{ bearerAuth: [] }]`, which was simply untrue — the code never
 * checked a token.
 *
 * Not mounting it at all in production is the guarantee; the requireAuth +
 * admin gate inside the router is the second layer for dev and staging, where
 * the same spawn still hands over a real environment.
 */
if (!appConfig.isProduction) {
  router.use('/simulation', simulationRoutes);
} else {
  // Answer deliberately, rather than falling through to the generic 404, so
  // that anyone probing the old path in production sees this was removed on
  // purpose and does not go looking for a mounting bug.
  router.all('/simulation{/*path}', (_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'SYSTEM_NOT_FOUND',
        message: 'Simulation tooling is not available in production.',
      },
    });
  });
}

export default router;
