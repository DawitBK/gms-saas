import path from 'path';
import { env } from './index';
import { resolveLicenseDeployment, resolveLicenseRequired } from './env.schema';

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
};

const toOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
};

export const appConfig = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  /**
   * Loopback by default in EVERY environment. This previously read
   * `env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'` — i.e. it bound
   * loopback in dev and every interface in production, which is backwards, and
   * directly contradicts the C5 pre-deploy check ("All 4 API
   * ports loopback-only: 7100/7200/7300/7400 … Nothing on 0.0.0.0") plus
   * the platform's stated architecture ("80/443 through Apache is the only
   * sanctioned public entry point"). Set HOST explicitly only for a genuine
   * multi-host topology.
   */
  host: env.HOST ?? '127.0.0.1',

  /**
   * P1-11: the ONLY path the refresh cookie needs to reach.
   *
   * All four systems share portal.examplecorp.com and are separated by path alone,
   * so `Path=/` sent GMS's refresh token — a bearer credential — to DMS's, SSO's
   * and MRS's backends on every request they served. None of them read it; all of
   * them log headers and can be compromised independently.
   *
   * It cannot be narrowed to `/gms` (the SPA's prefix): GMS's API is mounted at
   * the UNPREFIXED `/api/v1` on the shared origin — a deliberate, protected
   * decision because that routing is already live and proven —
   * and `/api/v1/auth/refresh` is the only thing that ever reads this cookie. So
   * scope it to the API prefix, which is exclusively GMS's, and it stops being
   * sent to the sibling systems AND to GMS's own page routes, which never need it.
   */
  refreshCookiePath: '/api/v1',
  clientUrl: env.CLIENT_URL,
  clientOrigin: toOrigin(env.CLIENT_URL),
  corsAllowedOrigins: (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => toOrigin(origin))
    .filter(Boolean),
  api: {
    basePath: normalizePath(env.API_BASE_PATH),
  },
  socket: {
    path: normalizePath(env.SOCKET_PATH),
  },
  redis: {
    url: env.REDIS_URL,
  },
  db: {
    sslEnabled: env.DB_SSL_ENABLED,
    sslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
  },
  https: {
    enabled: env.HTTPS_ENABLED,
    pfxPath: env.HTTPS_PFX_PATH,
    passphrase: env.HTTPS_PFX_PASSPHRASE,
  },
  docs: {
    enabled: env.NODE_ENV === 'production' ? env.ENABLE_API_DOCS : true,
  },
  metrics: {
    publicRouteEnabled: env.NODE_ENV === 'production' ? env.ENABLE_PUBLIC_METRICS_ROUTE : true,
  },
  security: {
    /**
     * P2-9 item 9: one bcrypt cost for the whole system, configurable.
     *
     * auth.service.ts used 10 for the bootstrap admin and 12 everywhere else, so
     * one account's hash was materially cheaper to crack than the rest for no
     * stated reason. 12 is the value the majority of call sites already used;
     * raising it later is now an env change rather than a hunt for literals.
     */
    bcryptCost: env.BCRYPT_COST ?? 12,
    /**
     * PLATFORM-VERIFICATION-AUDIT-2026-09-19, GMS bootstrap admin: first-run
     * creation of admin@examplecorp.net with the known default password used
     * to be unconditional in every environment. Same opt-in-in-production
     * pattern as `docs`/`metrics` above — on by default in dev/test so local
     * setup still works with zero config, off by default in production
     * unless explicitly enabled for a real first-boot.
     */
    bootstrapAdminEnabled: env.NODE_ENV === 'production' ? env.ENABLE_BOOTSTRAP_ADMIN : true,
  },
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  internalSso: {
    apiKey: env.SSO_INTERNAL_API_KEY,
    /**
     * P1-10: source addresses allowed to reach /api/v1/internal/sso at all,
     * checked before the shared key is compared. That endpoint mints a real GMS
     * session for any email the caller names, and its only genuine caller is the
     * SSO backend over loopback, so anything else is either a misconfiguration or
     * an attack. `*` disables the check — never in production.
     */
    allowedIps: env.INTERNAL_API_ALLOWED_IPS ?? '127.0.0.1,::1,::ffff:127.0.0.1',
  },
  sso: {
    apiBase: env.SSO_API_BASE,
    rolesApiKey: env.SSO_ROLES_API_KEY,
  },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.FROM_EMAIL,
    fromName: env.SMTP_FROM_NAME,
  },
  sendgrid: {
    apiKey: env.SENDGRID_API_KEY,
    fromEmail: env.SENDGRID_FROM_EMAIL ?? env.FROM_EMAIL,
    timeoutMs: env.SENDGRID_TIMEOUT_MS,
  },
  sms: {
    provider: env.SMS_PROVIDER,
    baseUrl: env.SMS_BASE_URL,
    apiKey: env.SMS_API_KEY,
    from: env.SMS_FROM,
    timeoutMs: env.SMS_TIMEOUT_MS,
    africasTalking: {
      username: env.AFRICAS_TALKING_USERNAME,
      apiKey: env.AFRICAS_TALKING_API_KEY,
      baseUrl: env.AFRICAS_TALKING_BASE_URL,
    },
  },
  unifiAccess: {
    baseUrl: env.UNIFI_ACCESS_BASE_URL,
    apiKey: env.UNIFI_ACCESS_API_KEY,
    timeoutMs: env.UNIFI_ACCESS_TIMEOUT_MS,
    maxRetries: env.UNIFI_ACCESS_MAX_RETRIES,
    tlsRejectUnauthorized: env.UNIFI_ACCESS_TLS_REJECT_UNAUTHORIZED,
    pollIntervalMs: env.UNIFI_ACCESS_POLL_INTERVAL_MS,
    qrMode: env.UNIFI_ACCESS_QR_MODE,
    doorMap: env.UNIFI_ACCESS_DOOR_MAP,
    resourceMap: env.UNIFI_ACCESS_RESOURCE_MAP,
    webhookSecret: env.UNIFI_ACCESS_WEBHOOK_SECRET,
  },
  observability: {
    sentryDsn: env.SENTRY_DSN,
    sentryTraceSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    metricsEnabled: env.METRICS_ENABLED,
  },
  rateLimit: {
    globalMax: env.RATE_LIMIT_GLOBAL_MAX,
    authMax: env.RATE_LIMIT_AUTH_MAX,
    criticalMax: env.RATE_LIMIT_CRITICAL_MAX,
    userMax: env.RATE_LIMIT_USER_MAX,
  },
  outbox: {
    pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
  },
  background: {
    queueWorkersEnabled: env.ENABLE_QUEUE_WORKERS,
    outboxPollingEnabled: env.ENABLE_OUTBOX_POLLING,
    unifiAccessPollingEnabled: env.ENABLE_UNIFI_ACCESS_POLLING,
  },
  /**
   * Platform licence (docs/operations/PLATFORM-LICENSING.md, system key `gms`).
   * `publicTokenPath`, `jwksPath` and `discoveryPath` are the ONLY place the SSO endpoint paths
   * are written down. They are SSO's BACKEND paths (Apache strips `/sso` before SSO's backend
   * sees a request), addressed the same way `SSO_API_BASE` callers address it.
   */
  license: {
    system: 'gms' as const,
    enforcement: env.LICENSE_ENFORCEMENT,
    ssoUrl: env.LICENSE_SSO_URL.replace(/\/+$/, ''),
    pollSeconds: env.LICENSE_POLL_SECONDS,
    issuer: env.LICENSE_ISSUER,
    publicTokenPath: '/api/v1/licenses/public/gms',
    /** SSO's "SSO ends on this date" note (modules/license/license.ceiling.ts): this system ends no later than SSO does. */
    ceilingPath: '/api/v1/licenses/public/sso-expiry',
    jwksPath: '/jwks',
    discoveryPath: '/.well-known/openid-configuration',
    requestTimeoutMs: 5_000,
    dataDir: env.LICENSE_DATA_DIR
      ? path.resolve(env.LICENSE_DATA_DIR)
      : path.resolve(process.cwd(), 'data', 'license'),
    /** LICENSE_REQUIRED: true in production (live and mirror) unless set, false elsewhere. */
    required: resolveLicenseRequired(env),
    /** Raw LICENSE_TRUST_PUBLIC_KEYS; parsed (and its problems logged) by license.store.ts. */
    trustPublicKeys: env.LICENSE_TRUST_PUBLIC_KEYS,
    /** `sso` when GMS's own SSO integration is configured, otherwise `standalone` (never from a client). */
    deployment: resolveLicenseDeployment(env),
  },
  /** Incident containment (modules/license/incident.lock.ts): the lock file's path; undefined = feature off. */
  incident: {
    lockFile: env.INCIDENT_LOCK_FILE,
  },
  webPush: {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  },
};
