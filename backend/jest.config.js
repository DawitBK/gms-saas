/**
 * Jest configuration.
 *
 * Was jest.config.json until 2026-09-04. JSON has no comments, so the note
 * below lived under a "//roots" key — which Jest does not recognise and
 * warned about, loudly and twice, on every single test run. Moving to a .js
 * config keeps the explanation and removes the noise.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  /**
   * `roots` was <rootDir>/src/tests, which silently excluded every test file
   * living beside the code it tests: modules/auth/auth-me.test.ts,
   * modules/checkin/checkin-outbox.test.ts,
   * modules/visits/visit-lifecycle-notifications.test.ts and
   * infrastructure/websocket/websocket-host-room.test.ts had never run once,
   * and nothing reported them as skipped — the suite simply claimed a smaller
   * green number than it had earned. Rooted at src so testMatch decides what
   * is a test, not directory layout.
   */
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],

  /**
   * Jest's default is 5 s, and this suite is not a pure unit suite: several
   * files hit the real test database, real Redis, and — in email-worker.test.ts
   * — really render QR PNGs through qrcode and sharp. Run alone that file
   * finishes comfortably; run in parallel with 42 other suites competing for
   * the same CPU it took 22 s and failed, then passed on the next run with no
   * code change. A test that passes or fails depending on machine load is
   * worse than a slow one: it trains people to re-run rather than read the
   * failure. 30 s is well clear of the observed worst case while still being
   * short enough that a genuine hang is caught.
   */
  testTimeout: 30_000,

  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },

  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],

  collectCoverageFrom: ['src/**/*.ts', '!src/tests/**'],
  coverageDirectory: 'coverage',
};
