import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        office_id?: number;
      };
      userRoles?: string[];
      allRoles?: string[];
      // P2-4: `permissions?: string[]` removed — always empty, never read.
      // Authorization is roles (requireRole) plus service-layer scoping.
      idempotencyKey?: string;
      requestId?: string;
      log?: Logger;
    }
  }
}

export {};
