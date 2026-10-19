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
 * `refresh()` never throws; the poller's timer is unref'd so it cannot keep a process alive.
 */
import fs from 'fs';
import path from 'path';
import { appConfig } from '../../config/app.config';
import { logger } from '../../core/logger/logger';
import { computeLicenseState, type LicenseState } from './license.state';
import { LicenseTokenError, peekTokenKid, verifyLicenseToken, type Jwk, type LicenseClaims } from './license.token';
import { SsoTrust, fetchJson, type TrustConfig } from './license.trust';

export type LicenseSource = 'sso' | 'cache' | 'none';
export type RefreshOutcome =
  | 'updated'
  | 'unchanged'
  | 'ignored_older'
  | 'unconfigured'
  | 'rejected'
  | 'unreachable'
  | 'disabled';

export interface LicenseStoreConfig extends TrustConfig {
  system: string;
  enforcement: 'enforce' | 'warn' | 'off';
  publicTokenPath: string;
  pollSeconds: number;
  dataDir: string;
}

type Held =
  | { kind: 'unknown' }
  | { kind: 'unconfigured'; fetchedAt: Date }
  | { kind: 'licensed'; claims: LicenseClaims; token: string; source: 'sso' | 'cache'; fetchedAt: Date };

interface PersistedFile {
  token: string;
  issuer: string;
  keys: Jwk[];
  fetchedAt: string;
}

export interface LicenseSnapshot {
  state: LicenseState;
  daysRemaining: number | null;
  /** ISO string (expires + graceDays), or null when perpetual / no licence. */
  graceEndsAt: string | null;
  source: LicenseSource;
  fetchedAt: Date | null;
  claims: LicenseClaims | null;
}

const FILE_NAME = 'last-token.json';

export class LicenseStore {
  private held: Held = { kind: 'unknown' };
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<RefreshOutcome> | null = null;
  private readonly trust: SsoTrust;

  constructor(
    readonly config: LicenseStoreConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.trust = new SsoTrust(config);
  }

  get enforcement(): 'enforce' | 'warn' | 'off' {
    return this.config.enforcement;
  }

  /** Loads the persisted token (verified offline against the key snapshot saved with it). Never throws. */
  loadFromDisk(): void {
    if (this.config.enforcement === 'off') return;
    const file = path.join(this.config.dataDir, FILE_NAME);
    try {
      if (!fs.existsSync(file)) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedFile;
      if (!saved || typeof saved.token !== 'string' || typeof saved.issuer !== 'string' || !Array.isArray(saved.keys)) {
        throw new Error('unexpected file shape');
      }
      const claims = verifyLicenseToken(saved.token, {
        system: this.config.system,
        expectedIssuer: saved.issuer,
        keys: saved.keys,
      });
      this.trust.seed(saved.keys, saved.issuer);
      const fetchedAt = new Date(saved.fetchedAt);
      this.held = {
        kind: 'licensed',
        claims,
        token: saved.token,
        source: 'cache',
        fetchedAt: Number.isNaN(fetchedAt.getTime()) ? this.clock() : fetchedAt,
      };
      logger.info({ module: 'license', ver: claims.ver }, 'Loaded the cached licence token');
    } catch (err) {
      // A corrupt or tampered file is treated as no file: state stays `unknown` (no enforcement).
      logger.warn({ module: 'license', err: (err as Error).message }, 'Ignoring the cached licence token');
    }
  }

  private persist(token: string, keys: Jwk[], issuer: string): void {
    try {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      const kid = peekTokenKid(token);
      const usedKeys = kid ? keys.filter((key) => key.kid === kid) : keys;
      const body: PersistedFile = { token, issuer, keys: usedKeys, fetchedAt: this.clock().toISOString() };
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

  /** One poll. Never throws; concurrent calls share one run. */
  refresh(): Promise<RefreshOutcome> {
    if (this.config.enforcement === 'off') return Promise.resolve('disabled');
    if (!this.inFlight) {
      this.inFlight = this.doRefresh()
        .catch((err): RefreshOutcome => {
          logger.warn({ module: 'license', err: (err as Error).message }, 'Licence poll failed; keeping the last known state');
          return 'unreachable';
        })
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
      if (this.held.kind !== 'unconfigured') {
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

    let issuer: string;
    let keys: Jwk[];
    let claims: LicenseClaims;
    try {
      issuer = await this.trust.getIssuer();
      keys = await this.trust.getKeys();
      try {
        claims = verifyLicenseToken(token, { system: this.config.system, expectedIssuer: issuer, keys });
      } catch (err) {
        if (err instanceof LicenseTokenError && err.reason === 'unknown_kid') {
          keys = await this.trust.getKeys(true);
          claims = verifyLicenseToken(token, { system: this.config.system, expectedIssuer: issuer, keys });
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof LicenseTokenError) {
        logger.warn({ module: 'license', reason: err.reason, err: err.message }, 'Rejected a licence token; keeping the previous one');
        return 'rejected';
      }
      logger.warn({ module: 'license', err: (err as Error).message }, 'Could not obtain SSO trust material; keeping the last known state');
      return 'unreachable';
    }

    if (this.held.kind === 'licensed' && claims.ver < this.held.claims.ver) {
      logger.warn({ module: 'license', heldVer: this.held.claims.ver, gotVer: claims.ver }, 'Ignoring an older licence token');
      return 'ignored_older';
    }

    const changed = !(this.held.kind === 'licensed' && this.held.token === token);
    this.held = { kind: 'licensed', claims, token, source: 'sso', fetchedAt: this.clock() };
    if (changed) {
      this.persist(token, keys, issuer);
      logger.info({ module: 'license', ver: claims.ver, expiresAt: claims.expiresAt }, 'Licence token updated');
      return 'updated';
    }
    return 'unchanged';
  }

  /** Loads the cache, polls once without blocking the caller, then every `pollSeconds`. */
  start(): void {
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
    // `unknown` (never obtained a verified token) is this consumer's own state; the shared function
    // (a verbatim copy of SSO's licenses/state.ts) only knows "no record" and "a record".
    const computed =
      held.kind === 'unknown'
        ? { state: 'unknown' as LicenseState, daysRemaining: null, graceEndsAt: null }
        : computeLicenseState(
            held.kind === 'licensed'
              ? { expiresAt: held.claims.expiresAt, graceDays: held.claims.graceDays, warnDays: held.claims.warnDays }
              : null,
            now,
          );
    return {
      state: computed.state,
      daysRemaining: computed.daysRemaining,
      graceEndsAt: computed.graceEndsAt,
      source: held.kind === 'licensed' ? held.source : held.kind === 'unconfigured' ? 'sso' : 'none',
      fetchedAt: held.kind === 'unknown' ? null : held.fetchedAt,
      claims: held.kind === 'licensed' ? held.claims : null,
    };
  }
}

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
});
