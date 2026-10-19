/**
 * Per-application entitlement (docs/operations/PLATFORM-LICENSING.md section 9): may this system be used
 * at all? A layer ON TOP of the expiry state machine in license.state.ts, which is untouched (it is a
 * verbatim copy of SSO's). PURE: no I/O, no config, no clock.
 *
 *   not required                          -> licensed (today's behaviour; development and tests)
 *   required, no verified token           -> unlicensed, NO_LICENSE
 *   required, token's modes lack the
 *   deployment's own mode                 -> unlicensed, MODE_NOT_LICENSED
 *   otherwise                             -> licensed (expiry is then the state machine: `expired` = read-only)
 *
 * `token` is null when no token has been verified (state `unconfigured` or `unknown`). A token whose
 * `modes` is absent or empty covers `['sso']` only.
 */
import type { LicenseMode } from './license.token';

export type EntitlementReason = 'NO_LICENSE' | 'MODE_NOT_LICENSED';

export interface EntitlementInput {
  required: boolean;
  /** Computed by the system from its own SSO integration config, never by the client. */
  deployment: LicenseMode;
  /** The verified token's `modes` claim, or null when there is no verified token at all. */
  token: { modes?: readonly string[] | null } | null;
}

export interface Entitlement {
  licensed: boolean;
  reason: EntitlementReason | null;
}

/** `modes` as the contract reads it: absent, null or empty means `['sso']`. */
export function effectiveModes(modes: readonly string[] | null | undefined): readonly string[] {
  return modes && modes.length > 0 ? modes : ['sso'];
}

export function computeEntitlement(input: EntitlementInput): Entitlement {
  if (!input.required) return { licensed: true, reason: null };
  if (!input.token) return { licensed: false, reason: 'NO_LICENSE' };
  if (!effectiveModes(input.token.modes).includes(input.deployment)) {
    return { licensed: false, reason: 'MODE_NOT_LICENSED' };
  }
  return { licensed: true, reason: null };
}
