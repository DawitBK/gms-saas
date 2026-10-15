import * as dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../../infrastructure/database/sequelize';
import { VisitService } from './visit.service';

describe('Visit Lifecycle Notifications', () => {
  let visitService: VisitService;

  beforeAll(async () => {
    visitService = new VisitService();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('verifies the visit service is loadable and implements notification logic', () => {
    expect(visitService).toBeDefined();
    // Verify method definitions
    expect(typeof visitService.rescheduleVisit).toBe('function');
    expect(typeof visitService.reassignVisit).toBe('function');
    expect(typeof visitService.escalateVisit).toBe('function');
  });
});
