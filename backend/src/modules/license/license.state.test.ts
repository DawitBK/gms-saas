import { describe, expect, it } from '@jest/globals';
import { computeLicenseState, DAY_MS, type LicenseDates } from './license.state';

// license.state.ts is a VERBATIM copy of the licence state.ts in the SSO edition (contract section 3); these tests pin the behaviour
// the three systems must share.
const EXPIRES = new Date('2027-01-01T00:00:00.000Z');
const at = (offsetMs: number) => new Date(EXPIRES.getTime() + offsetMs);
const licensed = (over: Partial<LicenseDates> = {}): LicenseDates => ({ expiresAt: EXPIRES, graceDays: 14, warnDays: 30, ...over });

describe('computeLicenseState (contract section 3)', () => {
  it('no record is unconfigured and carries no dates', () => {
    expect(computeLicenseState(null, new Date())).toEqual({
      state: 'unconfigured',
      daysRemaining: null,
      expiresAt: null,
      graceEndsAt: null,
      readOnly: false,
    });
  });

  it('perpetual (expiresAt null) is always active', () => {
    const far = new Date('2200-01-01T00:00:00.000Z');
    expect(computeLicenseState(licensed({ expiresAt: null }), far)).toEqual({
      state: 'active',
      daysRemaining: null,
      expiresAt: null,
      graceEndsAt: null,
      readOnly: false,
    });
  });

  it('active strictly before expires - warn', () => {
    expect(computeLicenseState(licensed(), at(-30 * DAY_MS - 1)).state).toBe('active');
  });

  it('expiring from exactly expires - warn (lower edge inclusive), up to the instant before expiry', () => {
    expect(computeLicenseState(licensed(), at(-30 * DAY_MS)).state).toBe('expiring');
    expect(computeLicenseState(licensed(), at(-1)).state).toBe('expiring');
  });

  it('grace from exactly expires (inclusive), until the instant before expires + grace', () => {
    expect(computeLicenseState(licensed(), at(0)).state).toBe('grace');
    expect(computeLicenseState(licensed(), at(14 * DAY_MS - 1)).state).toBe('grace');
  });

  it('expired from exactly expires + grace (inclusive); only expired is readOnly', () => {
    expect(computeLicenseState(licensed(), at(14 * DAY_MS))).toMatchObject({ state: 'expired', readOnly: true });
    expect(computeLicenseState(licensed(), at(400 * DAY_MS)).state).toBe('expired');
    expect(computeLicenseState(licensed(), at(14 * DAY_MS - 1)).readOnly).toBe(false);
  });

  it('graceDays 0: expiring straight into expired, no grace window', () => {
    const held = licensed({ graceDays: 0 });
    expect(computeLicenseState(held, at(-1)).state).toBe('expiring');
    expect(computeLicenseState(held, at(0)).state).toBe('expired');
  });

  it('warnDays 0: active straight into grace, no expiring window', () => {
    const held = licensed({ warnDays: 0 });
    expect(computeLicenseState(held, at(-1)).state).toBe('active');
    expect(computeLicenseState(held, at(0)).state).toBe('grace');
  });

  it('daysRemaining truncates toward zero: 2.9 left -> 2, 0.4 left -> 0, 0.4 past -> 0 (never -0), 2.9 past -> -2', () => {
    expect(computeLicenseState(licensed(), at(-10 * DAY_MS)).daysRemaining).toBe(10);
    expect(computeLicenseState(licensed(), at(-2.9 * DAY_MS)).daysRemaining).toBe(2);
    expect(computeLicenseState(licensed(), at(-0.4 * DAY_MS)).daysRemaining).toBe(0);
    const justPast = computeLicenseState(licensed(), at(0.4 * DAY_MS)).daysRemaining;
    expect(justPast).toBe(0);
    expect(Object.is(justPast, -0)).toBe(false);
    expect(computeLicenseState(licensed(), at(2.9 * DAY_MS)).daysRemaining).toBe(-2);
    expect(computeLicenseState(licensed(), at(3 * DAY_MS)).daysRemaining).toBe(-3);
  });

  it('graceEndsAt and expiresAt are ISO strings (expires + graceDays)', () => {
    expect(computeLicenseState(licensed(), at(0))).toMatchObject({
      expiresAt: '2027-01-01T00:00:00.000Z',
      graceEndsAt: '2027-01-15T00:00:00.000Z',
    });
  });

  it('accepts epoch milliseconds and ISO strings as well as Dates', () => {
    expect(computeLicenseState({ expiresAt: EXPIRES.getTime(), graceDays: 0, warnDays: 0 }, EXPIRES.getTime()).state).toBe('expired');
    expect(computeLicenseState({ expiresAt: '2027-01-01T00:00:00.000Z', graceDays: 14, warnDays: 30 }, at(0)).state).toBe('grace');
  });

  it('an unreadable date is `unknown` (never locks anyone), not a crash and not expired', () => {
    expect(computeLicenseState({ expiresAt: 'not-a-date', graceDays: 14, warnDays: 30 }, new Date())).toEqual({
      state: 'unknown',
      daysRemaining: null,
      expiresAt: null,
      graceEndsAt: null,
      readOnly: false,
    });
    expect(computeLicenseState(licensed(), new Date('garbage')).state).toBe('unknown');
  });
});
