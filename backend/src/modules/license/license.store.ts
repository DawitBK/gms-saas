/**
 * The licence holder and its poller (docs/operations/PLATFORM-LICENSING.md section 6).
 *
 * One instance per process. It keeps the last VERIFIED token in memory and on disk, and turns it into
 * a state with the pure function in license.state.ts. The two principles that matter most here:
 *
 *   1. No record = no enforcement. SSO's "there is no licence for gms" answer leaves this `unconfigured`.
 *   2. Never block because SSO is unreachable. A failed poll, a bad token, a malformed answer, a missing
 *      file: all of them leave whatever was held untouched (or `unknown`, which does not enforce).
 *
 * Section 9 (per-application entitlement) adds, only where `required` is true: pinned trust keys
 * (LICENSE_TRUST_PUBLIC_KEYS are then the ONLY keys that verify a token; SSO's JWKS is not consulted),
 * the install channel (`install()`), and SSO's 404 dropping a held token. With `required` false none of
 * that changes what this class did before.
 *
 * `refresh()` never throws; the poller's timer is unref'd so it cannot keep a process alive.
 */
import fs from 'fs';
import path from 'path';
import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { computeEntitlement, type Entitlement } from './license.entitlement';
import { computeLicenseState, type LicenseState } from './license.state';
import {
  LicenseTokenError,
  peekTokenKid,
  verifyLicenseToken,
  type Jwk,
  type LicenseClaims,
  type LicenseMode,
} from './license.token';
import { SsoTrust, fetchJson, parseTrustPublicKeys, type TrustConfig } from './license.trust';
import { applyCeiling, verifyCeilingToken, type CeilingClaims, type LimitedBy } from './license.ceiling';

export type LicenseSource = 'sso' | 'cache' | 'none';
export type RefreshOutcome =
  | 'updated'
  | 'unchanged'
  | 'ignored_older'
  | 'unconfigured'
  | 'rejected'
  | 'unreachable'
  | 'disabled';

export type InstallOutcome = 'installed' | 'unchanged' | 'ignored_older' | 'rejected' | 'unavailable';

export interface InstallResult {
  outcome: InstallOutcome;
  /** Why a token was rejected (the LicenseTokenError reason); only set with `rejected`. */
  reason?: LicenseTokenError['reason'];
  /** The version now held (installed / unchanged / ignored_older). */
  version?: number;
}

export interface LicenseStoreConfig extends TrustConfig {
  system: string;
  enforcement: 'enforce' | 'warn' | 'off';
  publicTokenPath: string;
  pollSeconds: number;
  dataDir: string;
  /** LICENSE_REQUIRED (section 9). Default false: today's behaviour. */
  required?: boolean;
  /** Pinned public keys (LICENSE_TRUST_PUBLIC_KEYS), already parsed. Authoritative when `required`. */
  trustKeys?: Jwk[];
  /** Problems found while parsing LICENSE_TRUST_PUBLIC_KEYS; reported at every start. */
  trustKeyErrors?: string[];
  /** Computed from GMS's own SSO integration config. Default 'sso'. */
  deployment?: LicenseMode;
  /** Only used to say, loudly, that LICENSE_REQUIRED=false in production. */
  isProduction?: boolean;
  /**
   * Where SSO publishes its "SSO ends on this date" note (license.ceiling.ts). Unset = never follow SSO. Followed only in the `sso` deployment mode:
   * a standalone system must not end because of somebody else's SSO.
   */
  ceilingPath?: string;
}

interface HeldCeiling {
  claims: CeilingClaims;
  token: string;
  fetchedAt: Date;
}

interface PersistedCeiling {
  token: string;
  issuer: string;
  keys: Jwk[];
  fetchedAt: string;
}

type Held =
  | { kind: 'unknown' }
  | { kind: 'unconfigured'; fetchedAt: Date }
  | {
      kind: 'licensed';
      claims: LicenseClaims;
      token: string;
      source: 'sso' | 'cache';
      /** `sso`: SSO served this token (so SSO's 404 may drop it). `installed`: only ever installed here (never dropped by a 404). */
      origin: TokenOrigin;
      fetchedAt: Date;
    };

type TokenOrigin = 'sso' | 'installed';

interface PersistedFile {
  token: string;
  issuer: string;
  keys: Jwk[];
  fetchedAt: string;
  /** Where the token came from; absent in files written before it was recorded. */
  origin?: TokenOrigin;
}

export interface LicenseSnapshot {
  state: LicenseState;
  daysRemaining: number | null;
  /** ISO string (expires + graceDays), or null when perpetual / no licence. */
  graceEndsAt: string | null;
  source: LicenseSource;
  fetchedAt: Date | null;
  /** Claims as ENFORCED: the licence's own, with SSO's date, grace and warning days when SSO ends first. */
  claims: LicenseClaims | null;
  /** Which date is binding: the licence's own, or SSO's ("SSO expiry follows"). null when no licence is held. */
  limitedBy?: LimitedBy | null;
}

const FILE_NAME = 'last-token.json';
const CEILING_FILE_NAME = 'sso-expiry.json';

export class LicenseStore {
  private held: Held = { kind: 'unknown' };
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<RefreshOutcome> | null = null;
  private readonly trust: SsoTrust;
  private ceiling: HeldCeiling | null = null;

  constructor(
    readonly config: LicenseStoreConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.trust = new SsoTrust(config);
  }

  get enforcement(): 'enforce' | 'warn' | 'off' {
    return this.config.enforcement;
  }

  get required(): boolean {
    return this.config.required === true;
  }

  get deployment(): LicenseMode {
    return this.config.deployment ?? 'sso';
  }

  /**
   * True when tokens verify against the pinned LICENSE_TRUST_PUBLIC_KEYS instead of SSO's JWKS: always
   * when licensing is required (even with no key configured, then nothing verifies), and when not
   * required only if the variable is set.
   */
  private get pinned(): boolean {
    return this.required || (this.config.trustKeys?.length ?? 0) > 0;
  }

  private get trustKeys(): Jwk[] {
    return this.config.trustKeys ?? [];
  }

  /** Does this system poll SSO's note? Only in the `sso` deployment mode, and only where the note's path is configured. Whether the note then BINDS is applyCeiling's call: only a licence without `standalone` in its modes ends with SSO. */
  private get followsSso(): boolean {
    return Boolean(this.config.ceilingPath) && this.deployment === 'sso' && this.config.enforcement !== 'off';
  }

  /** Section 9 entitlement for what is held right now. */
  entitlement(): Entitlement {
    return computeEntitlement({
      required: this.required,
      deployment: this.deployment,
      token: this.snapshot().claims,
    });
  }

  /** Loads the persisted token (verified offline against the key snapshot saved with it). Never throws. */
  loadFromDisk(): void {
    if (this.config.enforcement === 'off') return;
    this.loadCeilingFromDisk();
    const file = path.join(this.config.dataDir, FILE_NAME);
    try {
      if (!fs.existsSync(file)) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedFile;
      if (!saved || typeof saved.token !== 'string' || typeof saved.issuer !== 'string' || !Array.isArray(saved.keys)) {
        throw new Error('unexpected file shape');
      }
      // Pinned: the file's own key snapshot is never trusted, only the configured keys.
      const claims = this.pinned
        ? verifyLicenseToken(saved.token, { system: this.config.system, expectedIssuer: null, keys: this.trustKeys })
        : verifyLicenseToken(saved.token, { system: this.config.system, expectedIssuer: saved.issuer, keys: saved.keys });
      if (!this.pinned) this.trust.seed(saved.keys, saved.issuer);
      const fetchedAt = new Date(saved.fetchedAt);
      this.held = {
        kind: 'licensed',
        claims,
        token: saved.token,
        source: 'cache',
        // A file with no origin (written before it was recorded) cannot be told apart: treated as installed, so a 404 never drops it.
        origin: saved.origin === 'sso' ? 'sso' : 'installed',
        fetchedAt: Number.isNaN(fetchedAt.getTime()) ? this.clock() : fetchedAt,
      };
      logger.info({ module: 'license', ver: claims.ver }, 'Loaded the cached licence token');
    } catch (err) {
      // A corrupt or tampered file is treated as no file: state stays `unknown` (no enforcement).
      logger.warn({ module: 'license', err: (err as Error).message }, 'Ignoring the cached licence token');
    }
  }

  private persist(token: string, keys: Jwk[], issuer: string, origin: TokenOrigin): void {
    try {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      const kid = peekTokenKid(token);
      const usedKeys = kid ? keys.filter((key) => key.kid === kid) : keys;
      const body: PersistedFile = { token, issuer, keys: usedKeys, fetchedAt: this.clock().toISOString(), origin };
      const target = path.join(this.config.dataDir, FILE_NAME);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(body), 'utf8');
      fs.renameSync(tmp, target);
    } catch (err) {
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not persist the licence token (continuing from memory)');
    }
  }

  private removePersisted(): void {
    try {
      fs.rmSync(path.join(this.config.dataDir, FILE_NAME), { force: true });
    } catch (err) {
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not remove the cached licence token');
    }
  }

  // ── the "SSO ends on this date" note (license.ceiling.ts) ─────────────────────────────────────────────────────

  private loadCeilingFromDisk(): void {
    if (!this.followsSso) return;
    const file = path.join(this.config.dataDir, CEILING_FILE_NAME);
    try {
      if (!fs.existsSync(file)) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedCeiling;
      if (!saved || typeof saved.token !== 'string' || typeof saved.issuer !== 'string' || !Array.isArray(saved.keys)) throw new Error('unexpected file shape');
      const claims = verifyCeilingToken(saved.token, { expectedIssuer: saved.issuer, keys: saved.keys });
      this.trust.seed(saved.keys, saved.issuer);
      const fetchedAt = new Date(saved.fetchedAt);
      this.ceiling = { claims, token: saved.token, fetchedAt: Number.isNaN(fetchedAt.getTime()) ? this.clock() : fetchedAt };
      logger.info({ module: 'license', ver: claims.ver, expiresAt: claims.expiresAt }, 'Loaded the cached SSO expiry note');
    } catch (err) {
      // A corrupt or edited file is treated as no file: the licence's own date applies.
      logger.warn({ module: 'license', err: (err as Error).message }, 'Ignoring the cached SSO expiry note');
    }
  }

  private persistCeiling(token: string, keys: Jwk[], issuer: string): void {
    try {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      const kid = peekTokenKid(token);
      const body: PersistedCeiling = { token, issuer, keys: kid ? keys.filter((key) => key.kid === kid) : keys, fetchedAt: this.clock().toISOString() };
      const target = path.join(this.config.dataDir, CEILING_FILE_NAME);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(body), 'utf8');
      fs.renameSync(tmp, target);
    } catch (err) {
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not persist the SSO expiry note (continuing from memory)');
    }
  }

  private async verifyCeiling(token: string): Promise<{ claims: CeilingClaims; keys: Jwk[]; issuer: string }> {
    const issuer = await this.trust.getIssuer();
    let keys = await this.trust.getKeys();
    try {
      return { claims: verifyCeilingToken(token, { expectedIssuer: issuer, keys }), keys, issuer };
    } catch (err) {
      if (err instanceof LicenseTokenError && err.reason === 'unknown_kid') {
        keys = await this.trust.getKeys(true);
        return { claims: verifyCeilingToken(token, { expectedIssuer: issuer, keys }), keys, issuer };
      }
      throw err;
    }
  }

  /**
   * One poll of SSO's note. Never throws and never blocks anyone: an unreachable SSO, a bad answer or a note that does not verify leaves what is held
   * untouched (so blocking SSO cannot bring an ended system back). Only SSO's own "no licence record" answer drops the held note.
   */
  private async refreshCeiling(): Promise<void> {
    if (!this.followsSso) return;
    const url = `${this.config.ssoUrl}${this.config.ceilingPath}`;
    let status: number;
    let body: unknown;
    try {
      ({ status, body } = await fetchJson(url, this.config.requestTimeoutMs));
    } catch (err) {
      logger.debug({ module: 'license', err: (err as Error).message }, 'SSO expiry note: SSO unreachable; keeping what is held');
      return;
    }
    if (status === 404) {
      // Only SSO's own "no licence" answer ({ error: { code: 'ERR-LICENSE-NOT-FOUND' } }) drops the note. Any other 404 (an SSO without this endpoint yet,
      // a gateway, a proxy, an SSO in the middle of an update) says nothing about SSO's licence and must not bring an ended system back.
      const errorCode = (body as { error?: { code?: unknown } } | null)?.error?.code;
      if (errorCode !== 'ERR-LICENSE-NOT-FOUND') return;
      if (this.ceiling) {
        logger.info({ module: 'license' }, 'SSO has no licence record any more: the SSO expiry note is dropped, the licence\'s own date applies');
        this.ceiling = null;
        try {
          fs.rmSync(path.join(this.config.dataDir, CEILING_FILE_NAME), { force: true });
        } catch {
          /* best effort */
        }
      }
      return;
    }
    const token = (body as { token?: unknown } | null)?.token ?? (body as { data?: { token?: unknown } } | null)?.data?.token;
    if (status !== 200 || typeof token !== 'string') return;
    let verified: { claims: CeilingClaims; keys: Jwk[]; issuer: string };
    try {
      verified = await this.verifyCeiling(token);
    } catch (err) {
      logger.warn({ module: 'license', err: (err as Error).message }, 'Rejected an SSO expiry note; keeping the previous one');
      return;
    }
    if (this.ceiling && verified.claims.ver < this.ceiling.claims.ver) {
      logger.warn({ module: 'license', heldVer: this.ceiling.claims.ver, gotVer: verified.claims.ver }, 'Ignoring an older SSO expiry note');
      return;
    }
    const changed = !this.ceiling || this.ceiling.token !== token;
    this.ceiling = { claims: verified.claims, token, fetchedAt: this.clock() };
    if (changed) {
      this.persistCeiling(token, verified.keys, verified.issuer);
      logger.info({ module: 'license', ver: verified.claims.ver, expiresAt: verified.claims.expiresAt }, 'SSO expiry note updated');
    }
  }

  /** One poll. Never throws; concurrent calls share one run. */
  refresh(): Promise<RefreshOutcome> {
    if (this.config.enforcement === 'off') return Promise.resolve('disabled');
    if (!this.inFlight) {
      // The licence and SSO's note are fetched side by side, so a slow one never delays or compounds the other.
      this.inFlight = Promise.all([
        this.doRefresh().catch((err): RefreshOutcome => {
          logger.warn({ module: 'license', err: (err as Error).message }, 'Licence poll failed; keeping the last known state');
          return 'unreachable';
        }),
        this.refreshCeiling().catch((err) => logger.warn({ module: 'license', err: (err as Error).message }, 'SSO expiry note poll failed; keeping what is held')),
      ])
        .then(([outcome]) => outcome)
        .finally(() => {
          this.inFlight = null;
        });
    }
    return this.inFlight;
  }

  private async doRefresh(): Promise<RefreshOutcome> {
    const url = `${this.config.ssoUrl}${this.config.publicTokenPath}`;
    const { status, body } = await fetchJson(url, this.config.requestTimeoutMs);

    if (status === 404) {
      // SSO's own "no licence record" answer. SSO's generic "unrecognised route" 404 (an SSO that does
      // not have the licence API yet, or a wrong path) is NOT that answer and must not clear a held token.
      const errorField = (body as { error?: unknown } | null)?.error;
      if (body === null || typeof body !== 'object' || errorField === 'invalid_request') {
        logger.warn({ module: 'license', url }, 'SSO has no licence endpoint at this path; keeping the last known state');
        return 'unreachable';
      }
      if (this.held.kind === 'licensed' && this.held.origin === 'installed') {
        // Section 9: only a token SSO itself served can be revoked by SSO. One that was only installed here
        // (offline-signed; SSO may never have heard of it) is not SSO's to take away.
        logger.info({ module: 'license', ver: this.held.claims.ver }, 'SSO has no licence record, but the held token was installed here, not served by SSO; keeping it');
        return 'unchanged';
      }
      if (this.held.kind === 'licensed' && this.required) {
        // Section 9: where a licence is required, SSO's "no record" for a system whose token SSO served means it
        // was removed or revoked. The token is dropped below and the system becomes unlicensed.
        logger.warn({ module: 'license', ver: this.held.claims.ver }, 'SSO reports the licence was removed or revoked; dropping the stored token');
      } else if (this.held.kind !== 'unconfigured') {
        logger.info({ module: 'license' }, 'SSO reports no licence record for this system');
      }
      this.held = { kind: 'unconfigured', fetchedAt: this.clock() };
      this.removePersisted();
      return 'unconfigured';
    }

    const token =
      (body as { token?: unknown } | null)?.token ?? (body as { data?: { token?: unknown } } | null)?.data?.token;
    if (status !== 200 || typeof token !== 'string') {
      logger.warn({ module: 'license', status }, 'Licence poll got an unusable answer; keeping the last known state');
      return 'unreachable';
    }

    let verified: { claims: LicenseClaims; keys: Jwk[]; issuer: string };
    try {
      verified = await this.verifyToken(token);
    } catch (err) {
      if (err instanceof LicenseTokenError) {
        logger.warn({ module: 'license', reason: err.reason, err: err.message }, 'Rejected a licence token; keeping the previous one');
        return 'rejected';
      }
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not obtain SSO trust material; keeping the last known state');
      return 'unreachable';
    }

    const adopted = this.adopt(token, verified, 'sso');
    return adopted === 'installed' ? 'updated' : adopted;
  }

  /**
   * Verifies a token the way every channel does (poll, install): against the pinned keys when pinned
   * (no issuer check, no SSO round trip), otherwise against SSO's JWKS and discovery issuer. Throws
   * LicenseTokenError for a token to reject; any other error means trust material could not be reached.
   */
  private async verifyToken(token: string): Promise<{ claims: LicenseClaims; keys: Jwk[]; issuer: string }> {
    if (this.pinned) {
      const claims = verifyLicenseToken(token, { system: this.config.system, expectedIssuer: null, keys: this.trustKeys });
      return { claims, keys: [], issuer: '' };
    }
    const issuer = await this.trust.getIssuer();
    let keys = await this.trust.getKeys();
    try {
      return { claims: verifyLicenseToken(token, { system: this.config.system, expectedIssuer: issuer, keys }), keys, issuer };
    } catch (err) {
      if (err instanceof LicenseTokenError && err.reason === 'unknown_kid') {
        keys = await this.trust.getKeys(true);
        return { claims: verifyLicenseToken(token, { system: this.config.system, expectedIssuer: issuer, keys }), keys, issuer };
      }
      throw err;
    }
  }

  /** Newest `ver` wins; a lower one is ignored (never lowers what is held). */
  private adopt(
    token: string,
    verified: { claims: LicenseClaims; keys: Jwk[]; issuer: string },
    source: 'sso' | 'cache',
  ): 'installed' | 'unchanged' | 'ignored_older' {
    const { claims, keys, issuer } = verified;
    if (this.held.kind === 'licensed' && claims.ver < this.held.claims.ver) {
      logger.warn({ module: 'license', heldVer: this.held.claims.ver, gotVer: claims.ver }, 'Ignoring an older licence token');
      return 'ignored_older';
    }

    const origin: TokenOrigin = source === 'sso' ? 'sso' : 'installed';
    const changed = !(this.held.kind === 'licensed' && this.held.token === token);
    // The same token that SSO now serves is promoted to origin `sso` (and re-persisted); installing a token SSO already served changes nothing.
    const promoted = !changed && origin === 'sso' && this.held.kind === 'licensed' && this.held.origin !== 'sso';
    if (!changed && !promoted && source === 'cache') return 'unchanged';
    this.held = { kind: 'licensed', claims, token, source, origin, fetchedAt: this.clock() };
    if (promoted) this.persist(token, keys, issuer, origin);
    if (changed) {
      this.persist(token, keys, issuer, origin);
      logger.info({ module: 'license', ver: claims.ver, expiresAt: claims.expiresAt, jti: claims.jti ?? null, via: source === 'sso' ? 'poll' : 'install' }, 'Licence token updated');
      return 'installed';
    }
    return 'unchanged';
  }

  /**
   * POST /license/install (section 9): verified exactly like a fetched token, persisted through the same
   * file, never lowers the held `ver`. Never throws.
   */
  async install(token: string): Promise<InstallResult> {
    try {
      const verified = await this.verifyToken(token);
      const outcome = this.adopt(token, verified, 'cache');
      return { outcome, version: this.held.kind === 'licensed' ? this.held.claims.ver : verified.claims.ver };
    } catch (err) {
      if (err instanceof LicenseTokenError) {
        logger.warn({ module: 'license', reason: err.reason, err: err.message }, 'Rejected an installed licence token');
        return { outcome: 'rejected', reason: err.reason };
      }
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not obtain trust material to verify an installed licence token');
      return { outcome: 'unavailable' };
    }
  }

  /** Said at EVERY start, whatever the enforcement mode (section 9). */
  private logPosture(): void {
    const c = this.config;
    if (c.isProduction && !this.required) {
      logger.error({ module: 'license' }, 'LICENSE_REQUIRED=false in production: this system will run WITHOUT an installed licence. Set LICENSE_REQUIRED=true (the production default).');
    }
    if (this.required && c.enforcement !== 'enforce') {
      logger.error(
        { module: 'license', enforcement: c.enforcement },
        `LICENSE_ENFORCEMENT=${c.enforcement} while LICENSE_REQUIRED is true: an unlicensed system is NOT being refused. This is the emergency brake; restore LICENSE_ENFORCEMENT=enforce.`,
      );
    }
    for (const message of c.trustKeyErrors ?? []) logger.error({ module: 'license' }, message);
    if (this.required && this.trustKeys.length === 0) {
      logger.error({ module: 'license' }, 'LICENSE_REQUIRED is true but LICENSE_TRUST_PUBLIC_KEYS holds no usable key: no licence token can verify, so this system is unlicensed.');
    }
    logger.info(
      { module: 'license', required: this.required, deployment: this.deployment, pinnedKeys: this.trustKeys.length },
      'Licence entitlement settings',
    );
  }

  /** Loads the cache, polls once without blocking the caller, then every `pollSeconds`. */
  start(): void {
    this.logPosture();
    if (this.config.enforcement === 'off') {
      logger.info({ module: 'license' }, 'Licence checking is off (LICENSE_ENFORCEMENT=off)');
      return;
    }
    if (this.timer) return;
    this.loadFromDisk();
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.config.pollSeconds * 1000);
    this.timer.unref();
    logger.info(
      { module: 'license', enforcement: this.config.enforcement, sso: this.config.ssoUrl, everySeconds: this.config.pollSeconds },
      'Licence poller started',
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(now: Date = this.clock()): LicenseSnapshot {
    const held = this.held;
    // What is enforced is the licence's own dates, unless SSO's note says SSO ends first (license.ceiling.ts: it can only shorten).
    const effective = held.kind === 'licensed' ? applyCeiling(held.claims, this.followsSso ? (this.ceiling?.claims ?? null) : null) : null;
    // `unknown` (never obtained a verified token) is this consumer's own state; the shared function
    // (a verbatim copy of SSO's licenses/state.ts) only knows "no record" and "a record".
    const computed =
      held.kind === 'unknown'
        ? { state: 'unknown' as LicenseState, daysRemaining: null, graceEndsAt: null }
        : computeLicenseState(
            effective
              ? { expiresAt: effective.claims.expiresAt, graceDays: effective.claims.graceDays, warnDays: effective.claims.warnDays }
              : null,
            now,
          );
    return {
      state: computed.state,
      daysRemaining: computed.daysRemaining,
      graceEndsAt: computed.graceEndsAt,
      source: held.kind === 'licensed' ? held.source : held.kind === 'unconfigured' ? 'sso' : 'none',
      fetchedAt: held.kind === 'unknown' ? null : held.fetchedAt,
      claims: effective ? effective.claims : null,
      limitedBy: effective ? effective.limitedBy : null,
    };
  }
}

const trust = parseTrustPublicKeys(appConfig.license.trustPublicKeys);

export const licenseStore = new LicenseStore({
  system: appConfig.license.system,
  enforcement: appConfig.license.enforcement,
  ssoUrl: appConfig.license.ssoUrl,
  jwksPath: appConfig.license.jwksPath,
  discoveryPath: appConfig.license.discoveryPath,
  issuer: appConfig.license.issuer,
  requestTimeoutMs: appConfig.license.requestTimeoutMs,
  publicTokenPath: appConfig.license.publicTokenPath,
  pollSeconds: appConfig.license.pollSeconds,
  dataDir: appConfig.license.dataDir,
  required: appConfig.license.required,
  trustKeys: trust.keys,
  trustKeyErrors: trust.errors,
  deployment: appConfig.license.deployment,
  isProduction: appConfig.isProduction,
  ceilingPath: appConfig.license.ceilingPath,
});
