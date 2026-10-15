import { appConfig } from './app.config';

export const getProductionRuntimeRequirementErrors = (config = appConfig): string[] => {
  if (!config.isProduction) {
    return [];
  }

  const errors: string[] = [];
  const hasUniFiBaseUrl = Boolean(config.unifiAccess.baseUrl);
  const hasUniFiApiKey = Boolean(config.unifiAccess.apiKey);
  const hasUniFiCredentials = hasUniFiBaseUrl && hasUniFiApiKey;

  if (!hasUniFiCredentials) {
    errors.push('UNIFI_ACCESS_BASE_URL and UNIFI_ACCESS_API_KEY are required in production.');
  }

  if (hasUniFiBaseUrl !== hasUniFiApiKey) {
    errors.push('UNIFI_ACCESS_BASE_URL and UNIFI_ACCESS_API_KEY must either both be set or both be omitted in production.');
  }

  const usesWebhookIngestion = !config.background?.unifiAccessPollingEnabled;
  if (hasUniFiCredentials && usesWebhookIngestion && !config.unifiAccess.webhookSecret) {
    errors.push(
      'UNIFI_ACCESS_WEBHOOK_SECRET is required in production when UniFi Access integration uses webhook ingestion.'
    );
  }

  /**
   * P1-14: everything below was missing. GMS's production checks were UniFi-only
   * here, plus three in env.schema.ts's superRefine (CLIENT_URL, two JWT secret
   * lengths) — against fourteen in DMS's assertProductionRuntimeRequirements.
   * Same "collect every error, throw once with all of them" shape as above, and
   * kept in this file rather than the schema so the existing
   * runtime-requirements test surface covers them.
   */

  /**
   * Redis. isSessionRevoked() fails closed in production, so a GMS deployed with
   * no REDIS_URL used to boot perfectly cleanly and then 503 every authenticated
   * request — the single worst boot-time gap in this system. P1-13's durable
   * Postgres fallback means that is now a degradation rather than an outage, but
   * it is still a degradation nobody chose: every authenticated request takes a
   * DB round-trip, and BullMQ (queue workers, outbox dispatch) has no backing
   * store at all.
   */
  if (!config.redis.url) {
    errors.push('REDIS_URL is required in production — session revocation, rate limiting and BullMQ queues all depend on it.');
  }

  // The database password. DMS refuses dev/placeholder credentials at boot; GMS
  // checked nothing, so a deploy that never got its real password booted and
  // failed at the first query instead of at startup.
  const dbPassword = process.env.DB_PASSWORD ?? '';
  if (!dbPassword.trim()) {
    errors.push('DB_PASSWORD must not be empty in production.');
  } else if (/^(changeme|change-me|password|postgres|secret|change-me-dev-password)$/i.test(dbPassword.trim())) {
    errors.push('DB_PASSWORD is still a placeholder/dev value in production — set the real database password.');
  }

  /**
   * Mail. GMS has two possible senders; if neither is really configured, every
   * notification is silently dropped. SMTP_HOST pointing at localhost in
   * production is the specific failure DMS already guards against: nodemailer
   * connects to nothing and the send fails per-message, invisibly.
   */
  const hasSendgrid = Boolean(config.sendgrid.apiKey);
  const smtpHost = (config.smtp.host ?? '').trim();
  if (!hasSendgrid && !smtpHost) {
    errors.push('Either SENDGRID_API_KEY or SMTP_HOST must be configured in production — otherwise every email is silently dropped.');
  }
  if (!hasSendgrid && smtpHost && /^(localhost|127\.0\.0\.1|::1)$/i.test(smtpHost)) {
    errors.push('SMTP_HOST cannot be localhost in production — mail would be sent to nothing.');
  }

  /**
   * Web push. VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are independently optional,
   * so a half-configured pair passed startup and then failed at the moment a
   * notification was actually being delivered.
   */
  const hasVapidPublic = Boolean(process.env.VAPID_PUBLIC_KEY);
  const hasVapidPrivate = Boolean(process.env.VAPID_PRIVATE_KEY);
  if (hasVapidPublic !== hasVapidPrivate) {
    errors.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must either both be set or both be omitted — a half-configured pair fails at push time, not at boot.');
  }

  // One secret used for both token types means a leaked access-token secret also
  // forges refresh tokens, and vice versa.
  if (config.jwt.secret && config.jwt.refreshSecret && config.jwt.secret === config.jwt.refreshSecret) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values in production.');
  }

  /**
   * P1-10's allowlist. `*` is a legitimate escape hatch for an unusual topology,
   * but it must be a deliberate, documented one — not something left behind from
   * a debugging session, because it re-exposes a full-authority endpoint (which
   * mints a GMS session for any email) to the network.
   */
  if ((config.internalSso.allowedIps ?? '').split(',').some((v) => v.trim() === '*')) {
    errors.push('INTERNAL_API_ALLOWED_IPS must not be "*" in production — that re-exposes the internal SSO session-minting API to the network.');
  }

  /**
   * Deliberately NOT checked here, so the omissions are on the record rather than
   * looking like oversights:
   *
   *  - The bootstrap admin password (`GMSAdmin@2026`, auth.service.ts). An
   *    explicit user decision; refusing to boot on it would break a deployment
   *    that is working as intended.
   *  - DISABLE_RATE_LIMIT / SIMULATION_LIVE_MODE. Also an explicit user decision.
   *    They are already inert in production — shared/middleware/rateLimiter.ts
   *    returns false for both when isProduction, and logs an ALERT at boot if
   *    either is set — so a hard boot refusal would add nothing but a new way for
   *    a leftover env var to take the service down.
   */

  return errors;
};

export const assertProductionRuntimeRequirements = (config = appConfig): void => {
  const errors = getProductionRuntimeRequirementErrors(config);
  if (errors.length === 0) {
    return;
  }

  throw new Error(`Production runtime requirements are not satisfied:\n- ${errors.join('\n- ')}`);
};
