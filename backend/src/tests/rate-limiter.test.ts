import { describe, it, expect } from '@jest/globals';
import { Request } from 'express';
import { userAwareKeyGenerator } from '../shared/middleware/rateLimiter';

describe('userAwareKeyGenerator', () => {
  it('uses req.user.id as the rate-limit key when the user is authenticated', () => {
    const req = {
      user: { id: 123, email: 'test@example.com' },
      ip: '192.168.1.1',
    } as unknown as Request;

    expect(userAwareKeyGenerator(req)).toBe('123');
  });

  it('falls back to the IP-based key when req.user is absent', () => {
    const req = {
      ip: '192.168.1.2',
    } as unknown as Request;

    const key = userAwareKeyGenerator(req);
    expect(key).toContain('192.168.1.2');
  });

  it('produces different keys for different authenticated users', () => {
    const reqA = { user: { id: 1, email: 'a@example.com' }, ip: '10.0.0.1' } as unknown as Request;
    const reqB = { user: { id: 2, email: 'b@example.com' }, ip: '10.0.0.1' } as unknown as Request;

    expect(userAwareKeyGenerator(reqA)).not.toBe(userAwareKeyGenerator(reqB));
  });
});
