import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import { Transaction } from "sequelize";
import { AuthRepository } from "./auth.repository";
import { User } from "../../infrastructure/database/models";
import { EmailService } from "../../infrastructure/email/email.service";
import { appConfig } from "../../config/app.config";
import { AppError } from "../../core/errors/AppError";
import { ErrorCodes } from "../../core/errors/errorCodes";
import {
  AuthResponseDTO,
  AuthSessionMetadata,
  mapAuthUserToDTO,
  AuthUserLike,
} from "./auth.dto";
import { withTransaction } from "../../core/db/transaction";
import { QUEUE_NAMES } from "../../infrastructure/queue/queue";
import { enqueueJob } from "../../infrastructure/events/outbox.service";
import { OcrService } from "../../shared/services/ocr.service";
import { logger } from "../../core/logger/logger";
import { getSsoGrantedRoles, SsoRolesApiError } from "./sso-roles-client";
import { generateOtp, hashOtp, otpMatches, otpChallengeIsLive, otpEmailJobPayload, OTP_PATTERN } from "../../shared/utils/otp";
import { isSessionRevoked, revokeUserSessions } from "../../shared/services/session-revocation.service";
import { logAudit } from "../../shared/services/audit.service";
import { assertSeatAvailable } from "../license/license.seats";

interface RegisterPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  company?: string;
  government_id?: string;
  document_url?: string;
}

// Registration OTP validity window. Kept consistent with the 2FA login OTP
// (see verifyTwoFactor below), which also uses a 10-minute window — the
// registration flow used to hardcode its own 15-minute window here, which
// was inconsistent and never surfaced to the frontend as a value it could
// render a countdown from.
const REGISTRATION_OTP_TTL_MS = 10 * 60 * 1000;

/** 2FA login code validity. Mirrors the registration window above. */
const TWO_FACTOR_OTP_TTL_MS = 10 * 60 * 1000;
/** Password-reset code validity. Longer than the others by design (the user
 *  has to leave the app to fetch it from email), which is exactly why the
 *  attempt ceiling below matters: a 30-minute window on a 10^6 keyspace is
 *  grindable without one. */
const RESET_OTP_TTL_MS = 30 * 60 * 1000;
/** Failed submissions of a single OTP before the code is burned. */
const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between password-reset code issuances for one account. Stops an
 *  attacker from side-stepping OTP_MAX_ATTEMPTS by simply requesting a fresh
 *  code, and stops this unauthenticated route being an email-bombing tool. */
const RESET_OTP_REISSUE_COOLDOWN_MS = 60 * 1000;

/**
 * P2-9 item 9: bcrypt cost, one value, from config.
 *
 * This file used 10 in one place and 12 in three others — so the bootstrap
 * admin's hash was materially cheaper to crack than every other user's, for no
 * stated reason. Reading it from config also means raising the cost later is an
 * env change rather than a hunt for every literal.
 */
const BCRYPT_COST = appConfig.security.bcryptCost;

/**
 * P2-4: `permissions: string[]` removed. It was hardcoded to `[]` in every token
 * GMS has ever issued and nothing ever read it — see the note where
 * requirePermission used to live in shared/middleware/rbac.middleware.ts.
 */
interface TokenUserPayload {
  id: number;
  email: string;
  roles: string[];
  office_id?: number;
  session_id?: string;
}

export interface SsoSessionRequest {
  email: string;
  givenName?: string;
  familyName?: string;
  initialRoles?: string[];
  initialOfficeId?: number | null;
}

export interface InternalOfficeOption {
  id: number;
  name: string;
}

export interface InternalUserStatus {
  exists: boolean;
  id: number | null;
  roles: string[];
  officeId: number | null;
  active: boolean | null;
}

/**
 * AuthService
 * 
 * Manages the core authentication and authorization lifecycle. 
 * Responsibilities include:
 * - User login and session creation (JWT issuance).
 * - Registration and multi-stage verification (OTP/2FA).
 * - Password management (reset/change).
 * - Identity verification via OCR (integration with OcrService).
 * - Session maintenance (token refresh and termination).
 */
export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  /**
   * Authenticates a user and establishes a secure session.
   * Includes self-healing logic for the bootstrap admin account.
   * @param email User's unique email address.
   * @param password Plain-text password.
   * @param metadata Client environmental info (IP, User Agent).
   * @returns An AuthResponseDTO containing access/refresh tokens and user details.
   */
  public async login(
    email: string,
    password: string,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthResponseDTO> {
    let userModel = await this.authRepository.findUserByEmail(email);
    const isBootstrapAdmin = email === 'admin@examplecorp.net';

    // FIX: role self-healing for the bootstrap admin used to run
    // unconditionally on every login ATTEMPT for this email — before the
    // password check below. That meant anyone could POST
    // {email:'admin@examplecorp.net', password:'anything'} and silently
    // trigger a re-grant of super_admin+admin to that account (undoing any
    // prior demotion/restriction) even though the login itself then failed
    // on the bad password. No valid credential was required to trigger the
    // privilege restoration. First-run bootstrap (creating the account when
    // it doesn't exist yet, with the known default password) is intentional
    // and stays unconditional — there is no password to check yet. Role
    // re-healing for an ALREADY-EXISTING account now happens only after the
    // password below has been verified as correct.
    // PLATFORM-VERIFICATION-AUDIT-2026-09-19: first-run creation of this
    // known-password account used to be unconditional in every environment,
    // including production. It is now gated behind an explicit opt-in
    // (`ENABLE_BOOTSTRAP_ADMIN`, on by default outside production — see
    // app.config.ts). If it's disabled and the account doesn't exist, login
    // falls through to the ordinary "Invalid credentials" path below.
    if (isBootstrapAdmin && !userModel && appConfig.security.bootstrapAdminEnabled) {
      await withTransaction(async (t) => {
        // P2-9 item 8: these were `require()` calls inside the method, and the
        // bcrypt one SHADOWED the top-level `import bcrypt from "bcryptjs"` —
        // so two different module instances and two different cost factors were
        // live in the same file with nothing to hint at it. Both are static
        // imports now (User at the top of this file).
        //
        // P2-9 item 9: cost was 10 here and 12 in every other bcrypt.hash call in
        // this file. The bootstrap admin's password is no less worth protecting
        // than anyone else's, so it uses the same configured cost as the rest.
        const hash = await bcrypt.hash('GMSAdmin@2026', BCRYPT_COST);
        userModel = await User.create({
          email,
          password_hash: hash,
          full_name: 'System Administrator',
          status: 'ACTIVE',
          requires_password_change: true
        }, { transaction: t });

        await this.authRepository.ensureRoleByName('super_admin', t);
        await this.authRepository.ensureRoleByName('admin', t);
        await this.authRepository.assignRoles(userModel!.id, ['super_admin', 'admin'], t);
      });
      userModel = await this.authRepository.findUserByEmail(email);
    }

    if (!userModel) {
      throw new AppError("Invalid credentials", ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    const user = userModel.toJSON ? userModel.toJSON() : userModel;

    if (user.status === "SUSPENDED") {
      throw new AppError("Account is suspended", ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    // FIX: registration now creates the account as PENDING_VERIFICATION (see
    // register() below) instead of ACTIVE, so an account whose OTP was never
    // confirmed cannot log in and obtain a session.
    if (user.status === "PENDING_VERIFICATION") {
      throw new AppError(
        "Please verify your email before logging in.",
        ErrorCodes.AUTH_UNAUTHORIZED,
        401,
      );
    }

    /**
     * P2-9 item 10: a commented-out `if (!user.email_verified) throw ...` block
     * lived here. Deleted rather than left in place: an abandoned security check
     * sitting in the login path reads to the next auditor as "email verification
     * is enforced", which it was not. GMS does not gate login on email
     * verification today — accounts are created by staff or provisioned through
     * SSO (which asserts email_verified itself), so there is no self-signup path
     * for an unverified address to log in from. If that changes, the check goes
     * back as real code with a test, not as a comment.
     */

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError("Invalid credentials", ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    // Role re-healing for an existing bootstrap admin account — only now
    // that the password has actually been verified. Re-fetch afterward so
    // the token issued below (generateTokens reads user.roles directly off
    // this object, it does not re-resolve from the DB) reflects the
    // just-healed roles rather than a stale pre-heal snapshot.
    let effectiveUser = user;
    if (isBootstrapAdmin) {
      const currentRoleNames = (user.roles ?? []).map((role: { name: string } | string) =>
        typeof role === 'string' ? role : role.name,
      );
      const wasDemoted = !currentRoleNames.includes('super_admin') && !currentRoleNames.includes('admin');
      if (wasDemoted) {
        // Someone (an admin, or a prior incident response) had deliberately
        // removed super_admin/admin from this account, and this login is
        // about to silently put them back. That is exactly the scenario
        // PLATFORM-VERIFICATION-AUDIT-2026-09-19 flagged: re-healing is still
        // useful for genuine bootstrap recovery, but it must not be able to
        // undo a deliberate demotion without anyone noticing.
        logger.warn(
          { email: user.email, priorRoles: currentRoleNames },
          'Bootstrap admin role self-heal is restoring super_admin/admin on a previously-demoted account',
        );
      }
      await withTransaction(async (t) => {
        await this.authRepository.ensureRoleByName('super_admin', t);
        await this.authRepository.ensureRoleByName('admin', t);
        await this.authRepository.assignRoles(user.id, ['super_admin', 'admin'], t);
      });
      const healedModel = await this.authRepository.findUserByEmail(email);
      effectiveUser = healedModel
        ? (healedModel.toJSON ? healedModel.toJSON() : healedModel)
        : user;
    }

    await this.authRepository.updateUserPresence(effectiveUser.id);

      // 2FA Challenge
      if (user.two_factor_enabled) {
        const otp = generateOtp();
        await (userModel as any).update({
          // Keyed digest, not the code itself — see shared/utils/otp.ts. The
          // plaintext exists only in the variable above and in the email that
          // is about to be sent.
          two_factor_otp: hashOtp(otp, userModel.id),
          two_factor_otp_at: new Date(),
          // Fresh code, fresh attempt budget (see registerOtpFailure).
          two_factor_otp_attempts: 0
        });

        // In development, send directly to bypass queue/worker chain
        if (!appConfig.isProduction) {
          // P2-9 item 8: was a `require()` inside the method — static now, so
          // this dev-only send path is visible to a plain grep for EmailService.
          const emailService = new EmailService();
          await emailService.send({
            to: user.email,
            subject: "GMS Two-Factor Authentication Code",
            html: `<div style="font-family:Arial,sans-serif;color:#0f172a;"><h2>Your Verification Code</h2><p>Your 2FA code is: <strong style="font-size:24px;letter-spacing:4px;">${otp}</strong></p><p>This code expires in 10 minutes.</p></div>`,
          });
          logger.info({ email: user.email }, "2FA OTP sent directly, bypassing outbox/queue (dev mode)");
        } else {
          // The code is queued sealed (never plaintext in outbox_events) — see otpEmailJobPayload.
          await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, "SendVerification", otpEmailJobPayload(user.id, otp, "TWO_FACTOR_AUTH"));
        }

        return {
          requires_2fa: true,
          email: user.email
        } as any;
      }

    const tokenUser = await this.resolveTokenRoles(effectiveUser);
    return this.generateTokens(
      tokenUser,
      await this.authRepository.resolveUserOfficeId(effectiveUser.id),
      metadata,
      undefined,
      undefined,
      effectiveUser.requires_password_change
    );
  }

  /**
   * PLATFORM-GAP-012 fix: native (non-SSO-bridged) login used to mint its JWT
   * straight from GMS's own local `roles`/`user_roles` tables, never consulting
   * SSO — the one login path where SSO's per-user role grant (written by GMS's
   * own admin UI via setSsoGrantedRoles, see sso-roles-client.ts) had no effect
   * until the token was refreshed or the user re-logged in via the SSO bridge.
   * Same precedence issueSsoSession already applies to bridged logins: an
   * explicit SSO grant, when one exists, wins over the local table. If SSO has
   * no grant for this user (empty array) or is unreachable, fall back to the
   * local roles unchanged — login must not hard-fail just because SSO is down,
   * matching the degrade-to-default pattern already used by
   * resolveEdamsRolesFromGroups on the SSO side.
   */
  private async resolveTokenRoles(user: AuthUserLike & { email: string }): Promise<AuthUserLike> {
    try {
      const grantedRoles = await getSsoGrantedRoles(user.email);
      if (grantedRoles.length > 0) {
        return { ...user, roles: grantedRoles.map((name) => ({ name })) };
      }
    } catch (err) {
      const reason = err instanceof SsoRolesApiError ? err.message : (err as Error).message;
      logger.warn({ email: user.email, reason }, "SSO role resolution failed at native login — falling back to GMS's local roles table");
    }
    return user;
  }

  /**
   * Creates a GMS-owned session after the IdP has authenticated a staff user.
   *
   * SSO supplies initial roles for first-time provisioning and, for subsequent
   * SSO logins, the session JWT prefers those SSO-resolved roles while local
   * role tables remain untouched (admin UI / password login still read them).
   * A lone SSO `guest` fallback never demotes an existing staff account that
   * already has local roles — that only applies when no group mapping matched.
   */
  public async issueSsoSession(
    request: SsoSessionRequest,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthResponseDTO> {
    const email = request.email.trim().toLowerCase();
    let userModel = await this.authRepository.findUserByEmail(email);

    if (!userModel) {
      const fullName = [request.givenName, request.familyName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ')
        .trim() || email;
      const initialRoles = request.initialRoles?.length ? request.initialRoles : ['guest'];

      await withTransaction(async (transaction) => {
        const existing = await this.authRepository.findUserByEmail(email, transaction);
        if (existing) {
          userModel = existing;
          return;
        }

        // JIT provisioning from SSO takes a licence seat (403 LICENSE_SEAT_LIMIT when none is left).
        await assertSeatAvailable({ email, transaction });
        const created = await this.authRepository.createUser({
          full_name: fullName,
          email,
          // SSO-provisioned users authenticate at the IdP, never through the
          // local password route. This intentionally unusable value prevents
          // a fabricated local password from becoming a fallback credential.
          password_hash: `sso$${randomUUID()}`,
          status: 'ACTIVE',
          email_verified: true,
          office_id: request.initialOfficeId ?? null,
        }, transaction);
        await this.authRepository.assignRoles(created.id, initialRoles, transaction);
        userModel = await this.authRepository.findUserById(created.id, transaction);
      });
    }

    if (!userModel) {
      throw new AppError('Unable to provision the GMS account', ErrorCodes.SYSTEM_INTERNAL_ERROR, 500);
    }

    const user = userModel.toJSON ? userModel.toJSON() : userModel;
    if (user.status !== 'ACTIVE') {
      throw new AppError('GMS account is not active', ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    const ssoRoles = (request.initialRoles ?? []).filter(Boolean);
    const localRoleNames = (user.roles ?? []).map((role: { name: string } | string) =>
      typeof role === 'string' ? role : role.name,
    );
    const ssoIsOnlyGuest = ssoRoles.length === 1 && ssoRoles[0] === 'guest';
    const preferSsoRoles = ssoRoles.length > 0 && !(ssoIsOnlyGuest && localRoleNames.length > 0);
    const tokenUser = preferSsoRoles
      ? { ...user, roles: ssoRoles.map((name) => ({ name })) }
      : user;

    return this.generateTokens(
      tokenUser,
      await this.authRepository.resolveUserOfficeId(user.id),
      metadata,
      undefined,
      undefined,
      user.requires_password_change,
    );
  }

  /**
   * SSO asks GMS to end a user's sessions — deactivation, offboarding, or an
   * admin's "sign out everywhere" in the SSO console.
   *
   * This used to revoke only the `auth_sessions` rows, which is the mirror
   * image of the gap `revokeUserSessions` had: killing the rows stops any
   * FURTHER refresh, but the access token the user is already holding is a
   * stateless JWT and keeps working, at its old roles, until it expires on its
   * own — up to `JWT_EXPIRES_IN` (3h in production). So SSO would report the
   * account disabled while it kept working for the rest of the afternoon.
   *
   * The revocation cutoff is what invalidates an already-issued access token
   * (`auth.middleware.ts` checks it on every request), so an SSO-driven
   * revocation needs both halves — and `revokeUserSessions` now performs both.
   * The row revocation is still called first, because it is the one that
   * returns a count SSO displays.
   */
  public async revokeSsoSessionsByEmail(email: string): Promise<number> {
    const normalized = email.trim().toLowerCase();
    const revoked = await this.authRepository.revokeActiveSessionsByEmail(normalized);

    const userModel = await this.authRepository.findUserByEmail(normalized);
    if (userModel) {
      await revokeUserSessions(Number((userModel as any).id));
    }

    return revoked;
  }

  public async listSsoOffices(): Promise<InternalOfficeOption[]> {
    const offices = await this.authRepository.findActiveOfficeOptions();
    return offices.map((office: any) => ({
      id: Number(office.id),
      name: String(office.name),
    }));
  }

  public async getSsoUserStatus(email: string): Promise<InternalUserStatus> {
    const status = await this.authRepository.findUserStatusByEmail(email.trim().toLowerCase());
    if (!status) {
      return {
        exists: false,
        id: null,
        roles: [],
        officeId: null,
        active: null,
      };
    }

    return {
      exists: true,
      id: status.id,
      roles: status.roles,
      officeId: status.officeId,
      active: status.active,
    };
  }

  public async register(
    payload: RegisterPayload,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthResponseDTO> {
      const password_hash = await bcrypt.hash(payload.password, BCRYPT_COST);

      return withTransaction(async (transaction) => {
        const exists = await this.authRepository.findUserByEmail(payload.email);

      const {
        password,
        confirm_password,
        company,
        government_id,
        document_url,
        ...safePayload
      } = payload as any;

      // Self-registration creates an account; refused when the licence has no seat left.
      await assertSeatAvailable({ email: payload.email, transaction });

      let userModel;
      try {
        userModel = await this.authRepository.createUser(
          {
            ...safePayload,
            full_name: payload.full_name || payload.email.split("@")[0], // Fallback for testing
            password_hash,
            // FIX: the account used to be created with status ACTIVE
            // immediately at registration, before the OTP below was even
            // generated/sent — meaning a fully functional, loggable user row
            // existed prior to email verification. The row must still exist
            // early (role assignment, guest profile, and the OTP fields
            // themselves are columns on this same row, and there is no
            // separate pending-registration table in this schema), but it is
            // now created PENDING_VERIFICATION so nothing sensitive/functional
            // is available until verifyRegistration() flips it to ACTIVE.
            status: "PENDING_VERIFICATION",
          },
          transaction,
        );
      } catch (error: any) {
        if (error.name === "SequelizeUniqueConstraintError") {
          const field = error.errors?.[0]?.path || "field";
          throw new AppError(
            `A user with this ${field} already exists.`,
            ErrorCodes.INVALID_INPUT,
            409,
          );
        }
        throw error;
      }

      // Assign 'guest' role by default for registrations
      await this.authRepository.assignRoles(userModel.id, ["guest"], transaction);

      // Create guest profile
      await this.authRepository.findOrCreateGuestProfile(
        userModel.id,
        {
          company,
          government_id,
          document_url,
        },
        transaction,
      );

      const hydratedUserModel = await this.authRepository.findUserById(userModel.id);
      const hydratedUser = hydratedUserModel?.toJSON
        ? hydratedUserModel.toJSON()
        : hydratedUserModel;

      // Identity Verification (OCR): intentionally NOT enqueued. There is no
      // identity.worker and no dispatcher case for QUEUE_NAMES.IDENTITY_VERIFICATION
      // (the case in dispatchers.ts is commented out), so enqueuing here only
      // produced outbox rows that could never be consumed and would eventually
      // dead-letter. Re-enable together with the worker + dispatcher + registry
      // entry if identity verification is actually implemented.
      // if (payload.document_url) {
      //   await enqueueJob(QUEUE_NAMES.IDENTITY_VERIFICATION, "VerifyIdentity", {
      //     userId: userModel.id,
      //     documentUrl: payload.document_url,
      //     fullName: safePayload.full_name,
      //   }, transaction);
      // }

      const otp = generateOtp();
      await this.authRepository.updateUserOtp(userModel.id, otp, transaction);
      const otpExpiresAt = new Date(Date.now() + REGISTRATION_OTP_TTL_MS).toISOString();

      try {
        await enqueueJob(
          QUEUE_NAMES.EMAIL_NOTIFICATION,
          "SendVerification",
          otpEmailJobPayload(userModel.id, otp, "REGISTRATION_VERIFICATION"),
          transaction,
        );
      } catch {}

      return { ...(hydratedUser ?? userModel), otpExpiresAt };
    });
  }



  public async verifyRegistration(
    email: string,
    otp: string,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthResponseDTO> {
    const userModel = await this.authRepository.findUserByEmail(email);
    if (!userModel) {
      throw new AppError("Invalid verification code or account not found", ErrorCodes.INVALID_INPUT, 400);
    }

    const user = userModel.toJSON ? userModel.toJSON() : userModel;

    // FIX: removed a hardcoded "000000" master bypass that skipped both the
    // real code comparison AND the expiry check below — any caller who knew
    // (or guessed) this literal could "verify" and auto-login to any
    // unverified account, regardless of who registered it. It was gated on
    // nothing (no isProduction check), so it was live in every environment.
    /**
     * `otpMatches` rather than `===`, and a per-account attempt ceiling.
     *
     * Two problems, both specific to this code path and not the other two OTP
     * flows, which were already fixed:
     *
     * 1. Plain `===` on a secret. Every other OTP comparison in this service
     *    goes through the constant-time `otpMatches` helper; this one did not.
     * 2. No ceiling at all. `registerOtpFailure` could not be called here
     *    because there was no `registration_otp_attempts` column (added by
     *    migration 20260904000100), so the only throttle was the shared per-IP
     *    `authLimiter` — 10/min across nine routes, which bounds one source
     *    rather than one account and is defeated by spreading guesses across
     *    addresses. Against a 10-minute-lived six-digit code that is a
     *    grindable 10^6 keyspace.
     *
     * The consequence of a hit is the reason this matters more than the other
     * two: a correct guess does not reveal a code, it finalises the account and
     * auto-issues a full login session further down.
     */
    const isValid = otpMatches(user.registration_otp, otp, user.id);

    if (!isValid) {
      // Burns the outstanding code at the ceiling, forcing the attacker back
      // through the throttled resend rather than letting them keep hammering
      // one live code.
      await this.registerOtpFailure(userModel, "registration");
      throw new AppError("Invalid verification code", ErrorCodes.INVALID_INPUT, 400);
    }

    // Check expiry
    {
      const otpSentAt = new Date(user.registration_otp_at).getTime();
      const now = Date.now();
      if (now - otpSentAt > REGISTRATION_OTP_TTL_MS) {
        throw new AppError("Verification code has expired", ErrorCodes.AUTH_TOKEN_EXPIRED, 400);
      }
    }

    // Verification flips the account to ACTIVE, which takes a licence seat.
    if (String(user.status) !== "ACTIVE") {
      await assertSeatAvailable({ email: user.email });
    }

    // Mark as verified
    await this.authRepository.verifyUserEmail(user.id);

    // Auto-login after verification
    return this.generateTokens(
      user,
      await this.authRepository.resolveUserOfficeId(user.id),
      metadata,
    );
  }

  /**
   * resendVerification
   * Issues a fresh registration OTP for an email that is still pending
   * verification. Mirrors requestPasswordReset's generic-response pattern:
   * never reveals whether the account exists or is already verified, it
   * just silently no-ops and returns the same success shape either way.
   */
  public async resendVerification(email: string): Promise<{ email: string; otpExpiresAt: string }> {
    const otpExpiresAt = new Date(Date.now() + REGISTRATION_OTP_TTL_MS).toISOString();
    const userModel = await this.authRepository.findUserByEmail(email);

    if (!userModel) {
      return { email, otpExpiresAt };
    }

    const user = userModel.toJSON ? userModel.toJSON() : userModel;
    if (user.email_verified) {
      return { email, otpExpiresAt };
    }

    const otp = generateOtp();
    await this.authRepository.updateUserOtp(user.id, otp);

    try {
      await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, "SendVerification", otpEmailJobPayload(user.id, otp, "REGISTRATION_VERIFICATION"));
    } catch {}

    return { email, otpExpiresAt };
  }

  /**
   * updateRegistrationEmail
   * Lets a guest correct a typo'd email address before their account is
   * verified, without abandoning the whole registration. Re-points the
   * pending account at the new address and sends it a fresh OTP.
   */
  public async updateRegistrationEmail(
    oldEmail: string,
    newEmail: string,
    password: string,
  ): Promise<{ email: string; otpExpiresAt: string }> {
    const userModel = await this.authRepository.findUserByEmail(oldEmail);
    if (!userModel) {
      throw new AppError("Invalid request", ErrorCodes.INVALID_INPUT, 400);
    }

    const user = userModel.toJSON ? userModel.toJSON() : userModel;
    if (user.email_verified) {
      throw new AppError("This account is already verified — please log in instead.", ErrorCodes.INVALID_INPUT, 400);
    }

    /**
     * Proof that the caller is the person who started this registration.
     *
     * This endpoint has no session and cannot have one — the account is not
     * verified yet — and it cannot use the emailed OTP either, because the
     * whole purpose is that the address is wrong and the OTP was never
     * received. That left it, until now, taking an arbitrary `oldEmail` and
     * `newEmail` from anyone on the internet: an attacker who saw or guessed
     * that someone had just registered could redirect the pending account's
     * verification code to their own inbox, then call `POST /auth/verify`,
     * which auto-issues a full login session. Complete takeover of a stranger's
     * account, with no password at any point, plus everything registration
     * collects (government ID, uploaded document, phone).
     *
     * The password the registrant set minutes earlier is the only secret that
     * exists at this stage, and it is one the attacker does not have.
     *
     * The failure message is deliberately the same "Invalid request" used for
     * an unknown email, so this does not become an oracle for which addresses
     * have a pending registration.
     */
    const passwordMatches = await bcrypt.compare(password, (userModel as any).password_hash ?? "");
    if (!passwordMatches) {
      throw new AppError("Invalid request", ErrorCodes.INVALID_INPUT, 400);
    }

    if (newEmail !== oldEmail) {
      const conflicting = await this.authRepository.findUserByEmail(newEmail);
      if (conflicting) {
        throw new AppError("That email is already registered.", ErrorCodes.INVALID_INPUT, 409);
      }
    }

    try {
      await this.authRepository.updateUserEmail(user.id, newEmail);
    } catch (error: any) {
      if (error.name === "SequelizeUniqueConstraintError") {
        throw new AppError("That email is already registered.", ErrorCodes.INVALID_INPUT, 409);
      }
      throw error;
    }

    const otp = generateOtp();
    await this.authRepository.updateUserOtp(user.id, otp);
    const otpExpiresAt = new Date(Date.now() + REGISTRATION_OTP_TTL_MS).toISOString();

    try {
      await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, "SendVerification", otpEmailJobPayload(user.id, otp, "REGISTRATION_VERIFICATION"));
    } catch {}

    return { email: newEmail, otpExpiresAt };
  }

  public async refreshSession(
    refreshToken: string,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthResponseDTO> {
    let decoded: jwt.JwtPayload & { id: number; session_id?: string };
    try {
      decoded = jwt.verify(
        refreshToken,
        appConfig.jwt.refreshSecret as string,
      ) as jwt.JwtPayload & { id: number; session_id?: string };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(
          "Refresh token has expired",
          ErrorCodes.AUTH_TOKEN_EXPIRED,
          401,
        );
      }
      throw new AppError("Invalid refresh token", ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    if (!decoded.session_id) {
      throw new AppError(
        "Refresh token is missing session binding",
        ErrorCodes.AUTH_UNAUTHORIZED,
        401,
      );
    }

    const session = await this.authRepository.findActiveSessionByTokenId(
      decoded.session_id,
    );
    if (!session) {
      throw new AppError(
        "Session is no longer active",
        ErrorCodes.AUTH_UNAUTHORIZED,
        401,
      );
    }

    if (session.refresh_token_hash !== this.hashToken(refreshToken)) {
      await this.authRepository.revokeSession(decoded.session_id);
      throw new AppError(
        "Refresh token mismatch detected",
        ErrorCodes.AUTH_UNAUTHORIZED,
        401,
      );
    }

    const user = await this.requireUserById(decoded.id);
    // Every non-ACTIVE status, not just SUSPENDED. login() blocks both
    // SUSPENDED and PENDING_VERIFICATION; this blocked only SUSPENDED, so an
    // account left PENDING_VERIFICATION (or set to any status added later) kept
    // minting fresh access tokens from an old refresh cookie for the full
    // refresh lifetime.
    if (user.status !== "ACTIVE") {
      await this.authRepository.revokeSession(decoded.session_id);
      throw new AppError("Account is not active", ErrorCodes.AUTH_UNAUTHORIZED, 401);
    }

    /**
     * The revocation cutoff, on the refresh path. `revokeUserSessions` now
     * revokes the `auth_sessions` rows as well, so the lookup above would
     * normally have already failed — this is the second lock on the same door,
     * and it is the one that holds when the first is bypassed: a session row
     * created *after* a revocation (a race between the UPDATE and a concurrent
     * login), or any future revocation path that writes a cutoff and forgets
     * the rows, exactly as every path did until now.
     *
     * Compared against the refresh token's own `iat`, not the access token's:
     * this endpoint's job is to decide whether *this* refresh token is still
     * trusted, and one minted before the user revoked everything is not.
     */
    if (typeof decoded.iat === "number") {
      const revoked = await isSessionRevoked(user.id, decoded.iat);
      if (revoked) {
        await this.authRepository.revokeSession(decoded.session_id);
        throw new AppError(
          "Session has been revoked",
          ErrorCodes.AUTH_UNAUTHORIZED,
          401,
        );
      }
    }

    // Route through resolveTokenRoles like every other token-minting path here.
    // refreshSession called generateTokens directly, so the SSO per-user role
    // grant that PLATFORM-GAP-012 was fixed to honour at login was silently
    // ignored on every refresh -- for the whole refresh window.
    const refreshedTokenUser = await this.resolveTokenRoles(user);

    return this.generateTokens(
      refreshedTokenUser,
      await this.authRepository.resolveUserOfficeId(user.id),
      metadata,
      decoded.session_id,
      undefined,
      user.requires_password_change
    );
  }

  public async logout(refreshToken: string) {
    try {
      const decoded = jwt.verify(
        refreshToken,
        appConfig.jwt.refreshSecret as string,
      ) as jwt.JwtPayload & { session_id?: string };
      if (decoded.session_id) {
        await this.authRepository.revokeSession(decoded.session_id);
      }
    } catch {
      return;
    }
  }

  public async verifySession(refreshToken: string): Promise<AuthUserLike | null> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        appConfig.jwt.refreshSecret as string,
      ) as jwt.JwtPayload & { id: number; session_id?: string };

      if (!decoded.session_id) return null;

      const session = await this.authRepository.findActiveSessionByTokenId(
        decoded.session_id,
      );
      if (
        !session ||
        session.refresh_token_hash !== this.hashToken(refreshToken)
      )
        return null;

      const user = await this.requireUserById(decoded.id);
      // Same widening as refreshSession above: any non-ACTIVE status.
      if (user.status !== "ACTIVE") return null;

      return user;
    } catch {
      return null;
    }
  }

  private async generateTokens(
    user: AuthUserLike,
    office_id?: number,
    metadata?: AuthSessionMetadata,
    existingSessionId?: string,
    transaction?: Transaction,
    requires_password_change?: boolean,
  ): Promise<AuthResponseDTO> {
    const userDTO = mapAuthUserToDTO(user);
    const sessionId = randomUUID();
    const tokenPayload: TokenUserPayload = {
      id: userDTO.id,
      email: userDTO.email,
      roles: userDTO.roles ?? [],
      office_id,
      session_id: sessionId,
    };

    const accessToken = jwt.sign(tokenPayload, appConfig.jwt.secret as string, {
      expiresIn: appConfig.jwt.expiresIn as any,
    });

    const refreshToken = jwt.sign(
      { id: user.id, session_id: sessionId },
      appConfig.jwt.refreshSecret as string,
      { expiresIn: appConfig.jwt.refreshExpiresIn as any },
    );

    const expiresAt = this.calculateExpiryDate(appConfig.jwt.refreshExpiresIn);
    const refreshTokenHash = this.hashToken(refreshToken);

    if (existingSessionId) {
      await this.authRepository.rotateSession(existingSessionId, {
        token_id: sessionId,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        user_agent: metadata?.userAgent,
        ip_address: metadata?.ipAddress,
      }, transaction);
    } else {
      await this.authRepository.createSession({
        user_id: user.id,
        token_id: sessionId,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        user_agent: metadata?.userAgent,
        ip_address: metadata?.ipAddress,
      }, transaction);
    }

    return {
      user: userDTO,
      accessToken,
      refreshToken,
      requires_password_change: requires_password_change ?? user.requires_password_change ?? false,
    };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private calculateExpiryDate(expiresIn: string) {
    const now = Date.now();
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + value * multipliers[unit]);
  }

  public async requestPasswordReset(email: string) {
    const userModel = await this.authRepository.findUserByEmail(email);
    if (!userModel) return; // Silent return for security (no account enumeration)

    const existing = userModel.toJSON ? userModel.toJSON() : (userModel as any);

    /**
     * Throttle issuance, not just verification.
     *
     * Without this, an attacker could mint a fresh code on demand -- which both
     * defeats the per-code attempt ceiling in registerOtpFailure (just request
     * another) and turns this unauthenticated endpoint into an email-bombing
     * primitive against any known address. One code per minute per account.
     *
     * Returns silently rather than erroring, so the response is
     * indistinguishable from the not-found case above and the enumeration
     * defence is preserved.
     */
    if (
      existing.reset_password_otp &&
      otpChallengeIsLive(existing.reset_password_otp_at, RESET_OTP_REISSUE_COOLDOWN_MS)
    ) {
      logger.warn(
        { userId: existing.id },
        "Password-reset code requested again within the cooldown window - ignored",
      );
      return;
    }

    const otp = generateOtp();
    await (userModel as any).update({
      // Keyed digest, not the code itself — see shared/utils/otp.ts.
      reset_password_otp: hashOtp(otp, userModel.id),
      reset_password_otp_at: new Date(),
      // A newly issued code starts with a clean attempt budget.
      reset_password_otp_attempts: 0
    });

    await enqueueJob(QUEUE_NAMES.EMAIL_NOTIFICATION, "SendVerification", otpEmailJobPayload(userModel.id, otp, "PASSWORD_RESET"));
  }

  public async resetPassword(email: string, otp: unknown, newPassword: string) {
    // POST /auth/reset-password has no validateRequest schema, so `otp` arrives
    // as whatever JSON the client sent. Establish its shape BEFORE comparing:
    // the old `user.reset_password_otp !== otp` evaluated FALSE (i.e. "matched")
    // for {"otp": null} against a NULL column, and was stopped only
    // incidentally by new Date(null) landing on the epoch and tripping expiry.
    if (typeof otp !== "string" || !OTP_PATTERN.test(otp)) {
      throw new AppError("Invalid reset code", ErrorCodes.INVALID_INPUT, 400);
    }

    const userModel = await this.authRepository.findUserByEmail(email);
    // Generic error rather than "Account not found": this endpoint is
    // unauthenticated, so two distinguishable answers enumerate real addresses.
    if (!userModel) throw new AppError("Invalid reset code", ErrorCodes.INVALID_INPUT, 400);

    const user = userModel.toJSON ? userModel.toJSON() : userModel;

    // No challenge outstanding is a rejection, not something to compare.
    if (!user.reset_password_otp || !user.reset_password_otp_at) {
      throw new AppError("Invalid reset code", ErrorCodes.INVALID_INPUT, 400);
    }
    if (!otpChallengeIsLive(user.reset_password_otp_at, RESET_OTP_TTL_MS)) {
      throw new AppError("Reset code expired", ErrorCodes.AUTH_TOKEN_EXPIRED, 400);
    }
    if (!otpMatches(user.reset_password_otp, otp, user.id)) {
      // Count the failure and burn the code at the ceiling, so a 10^6 keyspace
      // cannot be ground down inside the code's 30-minute validity window.
      await this.registerOtpFailure(userModel, "reset_password");
      throw new AppError("Invalid reset code", ErrorCodes.INVALID_INPUT, 400);
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await (userModel as any).update({
      password_hash,
      reset_password_otp: null,
      reset_password_otp_at: null,
      reset_password_otp_attempts: 0,
      requires_password_change: false,
    });

    // A reset that leaves the attacker's existing session alive has not
    // recovered the account. Awaited, and allowed to throw in production
    // (session-revocation fails closed there) -- reporting success while every
    // pre-reset token still works would be a lie.
    await revokeUserSessions(user.id);
    await logAudit(user.id, "PASSWORD_RESET", "User", user.id, null, { method: "EMAIL_CODE" });
  }

  public async changePassword(userId: number, oldPass: string, newPass: string) {
    const userModel = await this.authRepository.findUserById(userId);
    if (!userModel) throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);

    const isValid = await bcrypt.compare(oldPass, (userModel as any).password_hash);
    if (!isValid) throw new AppError("Current password incorrect", ErrorCodes.AUTH_UNAUTHORIZED, 401);

    const password_hash = await bcrypt.hash(newPass, BCRYPT_COST);
    await (userModel as any).update({
      password_hash,
      requires_password_change: false
    });

    // Same reasoning as resetPassword: a password change must invalidate
    // sessions minted under the OLD password, or a token stolen beforehand
    // keeps working for its full remaining lifetime after the user has
    // "changed" their password.
    await revokeUserSessions(userId);
  }

  public async verifyPassword(userId: number, pass: string) {
    const userModel = await this.authRepository.findUserById(userId);
    if (!userModel) throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);

    const isValid = await bcrypt.compare(pass, (userModel as any).password_hash);
    if (!isValid) throw new AppError("Current password incorrect", ErrorCodes.AUTH_UNAUTHORIZED, 401);
  }

  public async verifyTwoFactor(email: string, otp: unknown, metadata?: AuthSessionMetadata): Promise<AuthResponseDTO> {
    const userModel = await this.authRepository.findUserByEmail(email);
    if (!userModel) throw new AppError("Invalid 2FA code or account not found", ErrorCodes.INVALID_INPUT, 400);

    const user = userModel.toJSON ? userModel.toJSON() : userModel;

    // FIX: removed a hardcoded "000000" master bypass. It skipped the real
    // OTP comparison, the expiry check, and — since this route has no
    // requireAuth and takes only {email, otp} — even the need for a prior
    // login: anyone who knew a target's email could POST
    // {email, otp:"000000"} here and receive a fully authenticated session
    // for that account, with no password and no TOTP device. Gated on
    // nothing (no isProduction check), so it was live in every environment.
    // Shape first, then existence, then expiry, then a constant-time compare.
    // `user.two_factor_otp !== otp` had the same null-vs-null hole as the reset
    // path, and this route additionally never checked two_factor_enabled at
    // all -- so it was reachable for accounts that have no second factor.
    if (typeof otp !== "string" || !OTP_PATTERN.test(otp)) {
      throw new AppError("Invalid 2FA code", ErrorCodes.INVALID_INPUT, 400);
    }
    if (!user.two_factor_enabled) {
      throw new AppError("Invalid 2FA code", ErrorCodes.INVALID_INPUT, 400);
    }
    if (!user.two_factor_otp || !user.two_factor_otp_at) {
      throw new AppError("Invalid 2FA code", ErrorCodes.INVALID_INPUT, 400);
    }
    if (!otpChallengeIsLive(user.two_factor_otp_at, TWO_FACTOR_OTP_TTL_MS)) {
      throw new AppError("2FA code expired", ErrorCodes.AUTH_TOKEN_EXPIRED, 400);
    }
    if (!otpMatches(user.two_factor_otp, otp, user.id)) {
      await this.registerOtpFailure(userModel, "two_factor");
      throw new AppError("Invalid 2FA code", ErrorCodes.INVALID_INPUT, 400);
    }

    await (userModel as any).update({ two_factor_otp: null, two_factor_otp_at: null, two_factor_otp_attempts: 0 });

    const tokenUser = await this.resolveTokenRoles(user);
    return this.generateTokens(
      tokenUser,
      await this.authRepository.resolveUserOfficeId(user.id),
      metadata,
      undefined,
      undefined,
      user.requires_password_change
    );
  }

  public async toggleTwoFactor(userId: number, enabled: boolean) {
    const userModel = await this.authRepository.findUserById(userId);
    if (!userModel) throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    await (userModel as any).update({ two_factor_enabled: enabled });
  }

  /**
   * Record one failed OTP submission and burn the code once the ceiling is hit.
   *
   * Nothing in this service previously counted failed OTP attempts at all. The
   * only throttle was the per-IP `authLimiter` on the route, which does not
   * bound attempts against a SINGLE account from many sources and, before the
   * fix in rateLimiter.ts, could be switched off by an env var. A six-digit
   * code is a 10^6 keyspace; the reset code lives for 30 minutes. Without a
   * per-account ceiling that is grindable, and the account never locks.
   *
   * Deliberately clears the code rather than locking the account: burning the
   * OTP forces the attacker back to `requestPasswordReset` (which is itself
   * throttled) instead of letting them keep hammering one live code, and it
   * cannot be used to lock a victim out of their own account by an attacker
   * spraying wrong codes -- the legitimate user just requests a new one.
   */
  private async registerOtpFailure(
    userModel: any,
    kind: "reset_password" | "two_factor" | "registration",
  ): Promise<void> {
    const attemptsField = `${kind}_otp_attempts`;
    const codeField = `${kind}_otp`;
    const issuedField = `${kind}_otp_at`;
    const current = Number(userModel[attemptsField] ?? 0) + 1;

    if (current >= OTP_MAX_ATTEMPTS) {
      await userModel.update({
        [attemptsField]: 0,
        [codeField]: null,
        [issuedField]: null,
      });
      logger.warn(
        { userId: userModel.id, kind, attempts: current },
        "OTP attempt ceiling reached - code invalidated, a new one must be requested",
      );
      return;
    }
    await userModel.update({ [attemptsField]: current });
  }

  private async requireUserById(id: number) {
    const userModel = await this.authRepository.findUserById(id);
    if (!userModel) {
      throw new AppError("User not found", ErrorCodes.SYSTEM_NOT_FOUND, 404);
    }
    return userModel.toJSON ? userModel.toJSON() : userModel;
  }
}
