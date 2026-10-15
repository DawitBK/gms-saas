import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../shared/middleware/validateRequest';
import { authMeSchema, changePasswordSchema, forgotPasswordSchema, refreshTokenSchema, resendVerificationSchema, resetPasswordSchema, toggleTwoFactorSchema, updateRegistrationEmailSchema, userCredentialsSchema, userRegistrationSchema, verifyPasswordSchema, verifyRegistrationSchema, verifyTwoFactorSchema } from './auth.schema';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { authLimiter, criticalActionLimiter } from '../../shared/middleware/rateLimiter';
import { requireCsrf } from '../../shared/middleware/csrf.middleware';
import { requireAuth } from '../../shared/middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

// Safe routing: Rate Limited, Zod Validated, Async Handled gracefully triggering AppErrors
router.post('/login', authLimiter, validateRequest(userCredentialsSchema), asyncHandler(controller.login));
router.post('/register', authLimiter, validateRequest(userRegistrationSchema), asyncHandler(controller.register));
router.post('/verify', authLimiter, validateRequest(verifyRegistrationSchema), asyncHandler(controller.verify));
router.post('/resend-verification', authLimiter, validateRequest(resendVerificationSchema), asyncHandler(controller.resendVerification));
router.post('/update-registration-email', authLimiter, validateRequest(updateRegistrationEmailSchema), asyncHandler(controller.updateRegistrationEmail));
router.post('/refresh', criticalActionLimiter, validateRequest(refreshTokenSchema), asyncHandler(controller.refresh));
router.post('/logout', criticalActionLimiter, requireCsrf, validateRequest(refreshTokenSchema), asyncHandler(controller.logout));

router.get('/me', authLimiter, validateRequest(authMeSchema), asyncHandler(controller.me));

// New Security Endpoints
// These two carry no auth, so validation is the only gate before the service.
router.post('/forgot-password', authLimiter, validateRequest(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
router.post('/reset-password', authLimiter, validateRequest(resetPasswordSchema), asyncHandler(controller.resetPassword));
router.post('/verify-2fa', authLimiter, validateRequest(verifyTwoFactorSchema), asyncHandler(controller.verify2fa));

// Protected Endpoints
router.post('/change-password', requireAuth, requireCsrf, validateRequest(changePasswordSchema), asyncHandler(controller.changePassword));
router.post('/toggle-2fa', requireAuth, requireCsrf, validateRequest(toggleTwoFactorSchema), asyncHandler(controller.toggleTwoFactor));
router.post('/verify-password', requireAuth, validateRequest(verifyPasswordSchema), asyncHandler(controller.verifyPassword));

export default router;
