/**
 * What this system trusts about SSO for licence purposes: its signing keys (JWKS) and its issuer.
 *
 * Keys are fetched from `{LICENSE_SSO_URL}{jwksPath}` and cached; an unknown `kid` makes the caller
 * ask for one forced refetch (throttled so a stream of forged kids cannot hammer SSO). The expected
 * issuer is `LICENSE_ISSUER` when pinned, otherwise what SSO's own discovery document reports.
 *
 * Every network call has a hard timeout and every failure surfaces as an exception the caller treats
 * as "could not reach SSO": keep the last good token, never block anyone.
 */
import type { Jwk } from './license.token';

export interface TrustConfig {
  ssoUrl: string;
  jwksPath: string;
  discoveryPath: string;
  issuer?: string;
  requestTimeoutMs: number;
}

/** Minimum gap between two forced JWKS refetches. */
const FORCED_REFETCH_MIN_GAP_MS = 10_000;

export async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: abort.signal, headers: { accept: 'application/json' } });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export class SsoTrust {
  private keys: Jwk[] = [];
  private discoveredIssuer: string | null = null;
  private lastForcedRefetchAt = 0;

  constructor(
    private readonly config: TrustConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Seeds the cache from a persisted snapshot so a boot with SSO down can still verify the cached token. */
  seed(keys: Jwk[], issuer: string | null): void {
    if (this.keys.length === 0) this.keys = keys;
    if (issuer && !this.discoveredIssuer) this.discoveredIssuer = issuer;
  }

  /** Returns cached keys; fetches when empty or when `force` (throttled; then the cache is returned unchanged). */
  async getKeys(force = false): Promise<Jwk[]> {
    if (this.keys.length > 0 && !force) return this.keys;
    if (force && this.keys.length > 0 && this.now() - this.lastForcedRefetchAt < FORCED_REFETCH_MIN_GAP_MS) {
      return this.keys;
    }
    if (force) this.lastForcedRefetchAt = this.now();

    const { status, body } = await fetchJson(`${this.config.ssoUrl}${this.config.jwksPath}`, this.config.requestTimeoutMs);
    const keys = (body as { keys?: unknown } | null)?.keys;
    if (status !== 200 || !Array.isArray(keys)) throw new Error(`SSO JWKS answered ${status}`);
    this.keys = keys.filter((key): key is Jwk => !!key && typeof key === 'object');
    return this.keys;
  }

  async getIssuer(): Promise<string> {
    if (this.config.issuer) return this.config.issuer;
    if (this.discoveredIssuer) return this.discoveredIssuer;
    const { status, body } = await fetchJson(`${this.config.ssoUrl}${this.config.discoveryPath}`, this.config.requestTimeoutMs);
    const issuer = (body as { issuer?: unknown } | null)?.issuer;
    if (status !== 200 || typeof issuer !== 'string' || !issuer) throw new Error(`SSO discovery answered ${status}`);
    this.discoveredIssuer = issuer;
    return issuer;
  }
}
