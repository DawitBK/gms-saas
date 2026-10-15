import { sequelize, closeDB } from '../../infrastructure/database/sequelize';
import { QueryTypes } from 'sequelize';

describe('Database integration', () => {
  beforeAll(async () => {
    // Ensure the connection can be established (CI will provide Postgres).
    await sequelize.authenticate();
  }, 30000);

  afterAll(async () => {
    await closeDB();
  });

  test('executes a basic SELECT query', async () => {
    const rows = await sequelize.query<{ ok: number }>('SELECT 1 as ok', { type: QueryTypes.SELECT });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]?.ok).toBe(1);
  });
});
