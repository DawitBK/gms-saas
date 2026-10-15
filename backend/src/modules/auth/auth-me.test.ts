import * as dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../../infrastructure/database/sequelize';
import { AuthService } from './auth.service';

describe('Auth ME verification logic', () => {
  let authService: AuthService;

  beforeAll(async () => {
    authService = new AuthService();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('knows about verifySession method', () => {
    expect(typeof authService.verifySession).toBe('function');
  });

  it('rejects an invalid token without crashing', async () => {
    // FIX: verifySession returns null on failure, not false — this asserted
    // `toBe(false)`, which is never true under Jest's strict equality, so
    // this test was red (or silently not exercising the real contract).
    const isValid = await authService.verifySession('invalid_token');
    expect(isValid).toBeNull();
  });
});
