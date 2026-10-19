import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional()
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('7200').transform(Number),
  HOST: z.string().optional(),
  CLIENT_URL: z.string().url().default('http://localhost:7201'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  API_BASE_PATH: z.string().default('/api/v1'),
  SOCKET_PATH: z.string().default('/socket.io'),
  HTTPS_ENABLED: z.string().default('false').transform((value) => value === 'true'),
  HTTPS_PFX_PATH: z.string().optional(),
  HTTPS_PFX_PASSPHRASE: z.string().optional(),
  ENABLE_API_DOCS: z.string().default('true').transform((value) => value === 'true'),
  ENABLE_PUBLIC_METRICS_ROUTE: z.string().default('true').transform((value) => value === 'true'),
  // Off by default in production: creating a known-password admin account on
  // first login attempt should be an explicit opt-in, not a standing behavior.
  ENABLE_BOOTSTRAP_ADMIN: z.string().default('false').transform((value) => value === 'true'),

  DB_HOST: z.string(),
  DB_PORT: z.string().default('5432').transform(Number),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SSL_ENABLED: z.string().default('false').transform((value) => value === 'true'),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().default('true').transform((value) => value === 'true'),

  REDIS_URL: optionalUrl,

  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10).optional(),

  // Shared only with the Identity Provider. Enables the narrow internal
  // SSO bridge API; it is never accepted from a browser client.
  // P2-9 item 9: bcrypt cost factor. 12 is the default used everywhere except the
  // bootstrap-admin path, which used 10; both now read this.
  BCRYPT_COST: z.string().optional().transform((v) => (v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 10 && v <= 15), {
      message: 'BCRYPT_COST must be an integer between 10 and 15',
    }),
  SSO_INTERNAL_API_KEY: z.string().min(32).optional(),
  /**
   * P1-10: comma-separated source addresses allowed to reach the internal SSO
   * bridge API. Defaults to loopback only, which is the real production topology
   * (SSO calls GMS at 127.0.0.1:7200). `*` disables the check.
   */
  INTERNAL_API_ALLOWED_IPS: z.string().optional(),

  // Outbound direction: GMS calling INTO SSO's per-user role-grant API
  // (platform directive §6.3 — SSO is the role system-of-record). Distinct
  // from SSO_INTERNAL_API_KEY above, which gates the opposite direction.
  SSO_API_BASE: optionalUrl,
  SSO_ROLES_API_KEY: z.string().min(32).optional(),

  JWT_EXPIRES_IN: z.string().default('3h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587').transform(Number),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  // Name shown in the recipient's inbox next to FROM_EMAIL (for example "Example Corp Guest Management").
  SMTP_FROM_NAME: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_TIMEOUT_MS: z.string().default('10000').transform(Number),

  SMS_PROVIDER: z.string().optional(),
  SMS_BASE_URL: optionalUrl,
  SMS_API_KEY: z.string().optional(),
  SMS_FROM: z.string().optional(),
  SMS_TIMEOUT_MS: z.string().default('10000').transform(Number),
  AFRICAS_TALKING_USERNAME: z.string().optional(),
  AFRICAS_TALKING_API_KEY: z.string().optional(),
  AFRICAS_TALKING_BASE_URL: z.string().url().default('https://api.africastalking.com'),

  UNIFI_ACCESS_BASE_URL: optionalUrl,
  UNIFI_ACCESS_API_KEY: z.string().optional(),
  UNIFI_ACCESS_TIMEOUT_MS: z.string().default('10000').transform(Number),
  UNIFI_ACCESS_MAX_RETRIES: z.string().default('3').transform(Number),
  UNIFI_ACCESS_TLS_REJECT_UNAUTHORIZED: z.string().default('true').transform((value) => value === 'true'),
  UNIFI_ACCESS_QR_MODE: z.enum(['auto', 'system', 'unifi']).default('auto'),
  UNIFI_ACCESS_DOOR_MAP: z.string().optional(),
  UNIFI_ACCESS_RESOURCE_MAP: z.string().optional(),
  UNIFI_ACCESS_WEBHOOK_SECRET: z.string().optional(),
  UNIFI_ACCESS_POLL_INTERVAL_MS: z.string().default('15000').transform(Number),

  SENTRY_DSN: optionalUrl,
  SENTRY_TRACES_SAMPLE_RATE: z.string().default('0.2').transform(Number),

  METRICS_ENABLED: z.string().default('true').transform((value) => value === 'true'),

  RATE_LIMIT_GLOBAL_MAX: z.string().default('1000').transform(Number),
  RATE_LIMIT_AUTH_MAX: z.string().default('10').transform(Number),
  RATE_LIMIT_CRITICAL_MAX: z.string().default('60').transform(Number),
  RATE_LIMIT_USER_MAX: z.string().default('5000').transform(Number),
  OUTBOX_POLL_INTERVAL_MS: z.string().default('5000').transform(Number),
  ENABLE_QUEUE_WORKERS: z.string().default('true').transform((value) => value === 'true'),
  ENABLE_OUTBOX_POLLING: z.string().default('true').transform((value) => value === 'true'),
  ENABLE_UNIFI_ACCESS_POLLING: z.string().default('false').transform((value) => value === 'true'),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:systems@examplecorp.com'),

  // Platform licence (docs/operations/PLATFORM-LICENSING.md). All optional. A blank value
  // reads as unset so a template line like `LICENSE_ENFORCEMENT=` cannot refuse a boot.
  //   enforce  compute the state, block when it says so (default)
  //   warn     compute and log/banner it, never block
  //   off      do not even fetch the licence
  LICENSE_ENFORCEMENT: z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim().toLowerCase() || undefined) : value),
    z.enum(['enforce', 'warn', 'off']).default('enforce'),
  ),
  // Where this backend reaches the SSO backend (the mirror sets http://127.0.0.1:9300).
  LICENSE_SSO_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url().default('http://127.0.0.1:7300'),
  ),
  LICENSE_POLL_SECONDS: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(10).max(86_400).default(300),
  ),
  // Pins the expected token issuer. Unset: the issuer SSO's own discovery document reports is used.
  LICENSE_ISSUER: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Where the last verified token is kept so a restart while SSO is down still enforces it.
  // Default: <backend cwd>/data/license (git-ignored).
  LICENSE_DATA_DIR: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production') {
    if (env.CLIENT_URL.includes('localhost')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLIENT_URL'],
        message: 'CLIENT_URL cannot be localhost in production',
      });
    }
    if (env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 characters in production',
      });
    }
    if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be at least 32 characters in production',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;
