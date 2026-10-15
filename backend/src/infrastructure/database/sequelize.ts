import { QueryTypes, Sequelize } from 'sequelize';
import { env } from '../../config';
import { logger } from '../../core/logger/logger';

const dialectOptions = {
  statement_timeout: 30000,
  ...(env.DB_SSL_ENABLED
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
        },
      }
    : {}),
};

/**
 * Enterprise Database Instance
 * Manages the connection pool and dialect-specific configurations for PostgreSQL.
 */
export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'postgres',
  dialectOptions,
  logging: env.NODE_ENV === 'production' ? false : (sql) => logger.debug({ sql }, 'db query'),
  pool: {
    max: env.NODE_ENV === 'production' ? 20 : 5,
    min: env.NODE_ENV === 'production' ? 2 : 1,
    acquire: 30000,
    idle: 10000,
    evict: 1000,
  },
  define: {
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

export const closeDB = async () => {
  try {
    await sequelize.close();
    logger.info('PostgreSQL connection closed gracefully.');
  } catch (error) {
    logger.error({ err: error }, 'Error while closing PostgreSQL connection.');
  }
};

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('PostgreSQL connection established successfully.');
    await runDevelopmentDatabasePreflight();
  } catch (error) {
    logger.fatal(
      {
        err: error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'PostgreSQL failed to initialize.'
    );
    process.exit(1);
  }
};

const runDevelopmentDatabasePreflight = async () => {
  if (env.NODE_ENV !== 'development') {
    return;
  }

  try {
    const tableRows = await sequelize.query<{ tablename: string }>(
      `
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
      `,
      { type: QueryTypes.SELECT }
    );

    const existingTables = new Set(tableRows.map((row) => row.tablename));
    const requiredTables = ['users', 'roles', 'auth_sessions', 'outbox_events', 'SequelizeMeta'];
    const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

    if (missingTables.length > 0) {
      logger.warn(
        {
          module: 'database',
          action: 'development.preflight',
          missingTables,
          dbHost: env.DB_HOST,
          dbPort: env.DB_PORT,
          dbName: env.DB_NAME,
        },
        'Development database is missing required tables. Run `npm run migrate` before using the API.'
      );
      return;
    }

    const [{ count: userCount }] = await sequelize.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM users',
      { type: QueryTypes.SELECT }
    );

    if (Number(userCount) === 0) {
      logger.warn(
        {
          module: 'database',
          action: 'development.preflight',
          dbHost: env.DB_HOST,
          dbPort: env.DB_PORT,
          dbName: env.DB_NAME,
        },
        'Development database has no users. Run `npm run seed` so login and sample flows work locally.'
      );
      return;
    }

    const [{ count: metaCount }] = await sequelize.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "SequelizeMeta"',
      { type: QueryTypes.SELECT }
    );

    if (Number(metaCount) === 0) {
      logger.warn(
        {
          module: 'database',
          action: 'development.preflight',
          dbHost: env.DB_HOST,
          dbPort: env.DB_PORT,
          dbName: env.DB_NAME,
        },
        'Development database has tables but no recorded migrations. Re-run `npm run migrate` to align schema history.'
      );
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        module: 'database',
        action: 'development.preflight',
        dbHost: env.DB_HOST,
        dbPort: env.DB_PORT,
        dbName: env.DB_NAME,
      },
      'Development database preflight check could not complete.'
    );
  }
};
