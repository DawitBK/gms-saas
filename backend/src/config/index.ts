import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { envSchema } from './env.schema';

const resolveNodeEnv = (): 'development' | 'production' | 'test' => {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') {
    return process.env.NODE_ENV;
  }

  return 'development';
};

// ---------------------------------------------------------------------------
// ENV FILE LOADING CONTRACT — identical in GMS, SSO and DMS. Change all three
// together or not at all.
//
//   NODE_ENV=production   ->  .env.production ONLY. `.env` is NEVER read.
//   anything else         ->  .env, then .env.<NODE_ENV> layered on top.
//
// GMS has always worked this way and is the system the other two were aligned
// to on 2026-09-05. The reason production is ISOLATED rather than layered:
// dotenv only overrides the keys the layering file actually NAMES, so any key
// `.env.production` happens not to mention would silently keep its DEVELOPER
// value in production. DMS was measured doing exactly that — dev database, a
// personal Gmail address intercepting every outbound notification — because it
// layered the two files. This ordering is what makes that impossible here.
// ---------------------------------------------------------------------------
const nodeEnv = resolveNodeEnv();
const envFiles =
  nodeEnv === 'production'
    // Production should be explicit and isolated from local developer leftovers.
    ? [`.env.${nodeEnv}`]
    : ['.env', `.env.${nodeEnv}`];

for (const envFile of envFiles) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: true, quiet: true });
  } else if (nodeEnv === 'production') {
    // dotenv is a SILENT no-op on a missing file. envSchema below does require
    // DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/JWT_SECRET, so a production boot with
    // no .env.production does already fail rather than silently reaching for a
    // dev database — but it fails as a wall of Zod validation errors, which
    // reads like a code fault rather than a missing file. Say the actual cause.
    console.error(
      `CRITICAL: NODE_ENV=production but ${envPath} does not exist.\n` +
        'Production configuration is read from .env.production ONLY — `.env` is the development ' +
        'file and is deliberately not read in production.\n' +
        '.env.production is gitignored (it holds real secrets) so it is never part of a clone or a ' +
        'file copy: it has to be placed on this machine by hand. See MANUAL-TRANSFER-TO-SERVER.md.',
    );
    process.exit(1);
  }
}

const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('CRITICAL: Invalid environment variables found on boot.');
    console.error(parsed.error.format());
    process.exit(1);
  }
  return {
    ...parsed.data,
    JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET ?? parsed.data.JWT_SECRET,
  };
};

export const env = parseEnv();
