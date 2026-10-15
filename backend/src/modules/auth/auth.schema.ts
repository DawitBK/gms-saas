import { z } from 'zod';

// We reuse the schemas we placed in `src/validation/schemas` or adapt them here natively.
// Following the Enterprise tree strictly: auth.schema.ts inside the domain module!
/**
 * One email field definition for every schema in this file.
 *
 * Beyond de-duplicating the regex, this adds `.trim().toLowerCase()`, which
 * fixes a real inconsistency: `AuthService.issueSsoSession` lowercases the
 * email before lookup, but the native login path passed `req.body.email`
 * straight to `findUserByEmail`. So an account provisioned via SSO as
 * `john@x.com` could not be found by a native login typed as `John@X.com`,
 * and registration could mint a second row differing only in case.
 */
/**
 * Applied to EVERY email field in this file as of 2026-09-04. It previously
 * covered only two of the seven auth schemas — the other five took a raw
 * `z.string().regex(...)` with no trim and no lowercasing, so the
 * normalisation described above held on login and reset but not on register,
 * verify, resend-verification, 2FA or the registration-email change. Which
 * meant the very duplicate-account and lookup-mismatch problems this constant
 * exists to prevent were still reachable through the majority of the routes.
 */
const EMAIL_FIELD = z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email structure');

export const userCredentialsSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

export const userRegistrationSchema = z.object({
  body: z.object({
    // full_name: z.string().min(2, 'Name required'),
    full_name: z.string().min(2, 'Name required').optional().or(z.literal('')),
    email: EMAIL_FIELD,
    phone: z.string().min(8, 'Phone number must be at least 8 characters').optional().or(z.literal('')),
    // password: z.string()
    //   .min(8, 'Password must be at least 8 characters')
    //   .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    //   .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    //   .regex(/[0-9]/, 'Password must contain at least one number')
    //   .regex(/[\W_]/, 'Password must contain at least one special character'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    company: z.string().optional(),
    government_id: z.string().optional(),
    document_url: z.string().optional()
  })
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }).optional(),
});

export const verifyRegistrationSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
    otp: z.string().length(6, 'Verification code must be 6 digits')
  })
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
  })
});

/**
 * Correcting a typo'd address on a not-yet-verified registration.
 *
 * `password` is required, and that requirement is the whole security of this
 * endpoint. It is unauthenticated by necessity — the point is that the person
 * cannot receive the OTP sent to the address they mistyped, so proof of
 * ownership cannot come from that inbox and cannot come from a session they
 * do not yet have. Without it, the endpoint took nothing but a pair of email
 * addresses and re-pointed somebody else's pending registration at an
 * attacker's inbox; the attacker then completed `POST /auth/verify`, which
 * auto-issues a full session, and owned the account and all the PII collected
 * during registration (government ID, uploaded document) without ever knowing
 * a password.
 *
 * The registrant chose a password moments earlier, so requiring it costs the
 * legitimate user nothing and is the one secret an attacker does not have.
 */
export const updateRegistrationEmailSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
    newEmail: EMAIL_FIELD,
    password: z.string().min(1, 'Password is required to change the registration email'),
  })
});

export const verifyTwoFactorSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
    otp: z.string().length(6, 'Verification code must be 6 digits')
  })
});

/**
 * The four schemas below cover routes that previously had NO validateRequest at
 * all: /forgot-password, /reset-password, /toggle-2fa and /verify-password.
 *
 * That mattered most for /reset-password: with no schema, `otp` reached the
 * service as whatever JSON the client sent, and the old
 * `user.reset_password_otp !== otp` comparison evaluated FALSE ("matched") for
 * {"otp": null} against a NULL column. It was stopped only incidentally, by
 * `new Date(null)` landing on the epoch and tripping the expiry branch. The
 * service now guards its own inputs too (see AuthService.resetPassword and
 * shared/utils/otp.ts) -- this is the outer layer of that, not a substitute.
 */
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: EMAIL_FIELD,
    // Exactly six digits. `.length(6)` alone would accept "abcdef".
    otp: z.string().regex(/^\d{6}$/, 'Reset code must be 6 digits'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

export const toggleTwoFactorSchema = z.object({
  body: z.object({
    // Required, and a real boolean. Previously unvalidated, so an absent
    // `enabled` reached Sequelize as `undefined`, which it skips -- the request
    // returned 200 having changed nothing, and told the user 2FA was "disabled".
    enabled: z.boolean(),
  }),
});

export const verifyPasswordSchema = z.object({
  body: z.object({
    // Previously unvalidated: an absent password meant bcrypt.compare(undefined,
    // hash) which throws, surfacing as a 500 instead of a 400.
    password: z.string().min(1, 'Password is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    old_password: z.string().min(1, 'Old password is required'),
    // Same rule as registration/login passwords (complexity refinements are disabled there too)
    new_password: z.string().min(6, 'Password must be at least 6 characters')
  })
});

export const authMeSchema = z.object({
  params: z.object({}).passthrough().optional(),
  query: z.object({}).passthrough().optional(),
  body: z.object({}).passthrough().optional(),
});
