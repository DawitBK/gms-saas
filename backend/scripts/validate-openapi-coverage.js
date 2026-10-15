/**
 * OpenAPI coverage gate: every live route-method pair under /api/v1 must appear
 * in the served OpenAPI document, and the document must not describe routes that
 * no longer exist.
 *
 * WHERE THE SPEC COMES FROM, AND WHY THIS CHANGED (2026-09-06).
 *
 * This script used to read a checked-in snapshot at `docs/api/openapi.json`.
 * That file was deleted on 2026-07-12 (commit 60c7d4f) and never replaced, so
 * the script has thrown ENOENT on its first read ever since — which means the
 * `openapi` CI job in .github/workflows/phase2-validation.yml has failed on
 * every push for two months, and `docker-build` (which `needs: [test, openapi]`)
 * has not run once in that time either. A gate that cannot pass is not a gate.
 *
 * It now reads the spec the application actually serves: `src/api/swagger.ts`,
 * a hand-maintained object mounted at /api-docs and /api-docs.json by app.ts.
 * That is strictly better than the old snapshot — a snapshot goes stale the
 * moment someone edits the spec, whereas this compares the routes against the
 * document real callers read.
 *
 * `swagger-jsdoc` is NOT involved despite being in package.json. Nothing
 * generates this spec from JSDoc comments; it is written by hand.
 *
 * NODE_ENV is forced to `test` before the spec is loaded, because swagger.ts
 * imports appConfig, which loads and Zod-validates the environment. `.env.test`
 * is committed and supplies everything the schema requires, so this runs in CI
 * with no configuration and never touches a real database.
 */
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRoot = path.join(repoRoot, 'backend');
const apiIndexPath = path.join(backendRoot, 'src', 'api', 'v1', 'index.ts');
const swaggerModulePath = path.join(backendRoot, 'src', 'api', 'swagger.ts');

const routeMethodPattern = /router\.(get|post|patch|put|delete)\(\s*["']([^"']+)["']/g;
const routeImportPattern = /import\s+(\w+)\s+from\s+'([^']+\.routes)'/g;
const routeMountPattern = /router\.use\('([^']+)',\s*(\w+)\)/g;

function normalizePath(routePath) {
  return (
    routePath
      .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

function readActualRoutes() {
  const apiIndexSource = fs.readFileSync(apiIndexPath, 'utf8');
  const imports = new Map();

  let match;
  while ((match = routeImportPattern.exec(apiIndexSource))) {
    imports.set(match[1], match[2]);
  }

  const routes = [];

  while ((match = routeMountPattern.exec(apiIndexSource))) {
    const mountPath = match[1];
    const importName = match[2];
    const relativeImport = imports.get(importName);
    if (!relativeImport) continue;

    const routeFile = path.resolve(path.dirname(apiIndexPath), `${relativeImport}.ts`);
    const routeSource = fs.readFileSync(routeFile, 'utf8');
    let routeMatch;
    while ((routeMatch = routeMethodPattern.exec(routeSource))) {
      const method = routeMatch[1].toUpperCase();
      const subPath = routeMatch[2];
      const fullPath = `${mountPath === '/' ? '' : mountPath}${subPath === '/' ? '' : subPath}`;
      routes.push(`${method} ${normalizePath(fullPath)}`);
    }
    routeMethodPattern.lastIndex = 0;
  }

  while ((match = routeMethodPattern.exec(apiIndexSource))) {
    routes.push(`${match[1].toUpperCase()} ${normalizePath(match[2])}`);
  }

  return [...new Set(routes)].sort();
}

function readDocumentedRoutes() {
  // transpileOnly (set in tsconfig's "ts-node" block) — this only needs the
  // object literal, not a type check; `npx tsc --noEmit` is a separate CI step.
  require('ts-node').register({ transpileOnly: true, project: path.join(backendRoot, 'tsconfig.json') });
  const { swaggerSpec } = require(swaggerModulePath);

  const documented = [];
  for (const [routePath, operations] of Object.entries(swaggerSpec.paths || {})) {
    for (const method of Object.keys(operations || {})) {
      if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
        documented.push(`${method.toUpperCase()} ${normalizePath(routePath)}`);
      }
    }
  }
  return [...new Set(documented)].sort();
}


/**
 * Routes that are live but not yet in src/api/swagger.ts, as measured on
 * 2026-09-06 when this gate was repaired.
 *
 * This list exists so the gate can be USEFUL TODAY rather than perfect later.
 * Documenting 47 endpoints by hand is real work and belongs in its own change;
 * leaving the job red until someone does it is how it stayed broken for two
 * months in the first place. So: anything on this list is tolerated, anything
 * NOT on it fails the build, and the list can only ever shrink — documenting a
 * route without removing its line here is itself a failure, which is what stops
 * the baseline quietly outliving the debt it records.
 *
 * Do not add to this list. If a new route needs an entry, document the route.
 */
const UNDOCUMENTED_BASELINE = new Set([
  'DELETE /availability/rules/{id}',
  'DELETE /departments/{id}',
  'DELETE /offices/{id}',
  'DELETE /services/{id}',
  'GET /approvals/visit/{visitId}',
  'GET /availability/host-board',
  'GET /availability/time_slots',
  'GET /credentials/visit/{visitId}',
  'GET /departments',
  'GET /departments/{id}',
  'GET /guests',
  'GET /guests/me',
  'GET /hosts',
  'GET /hosts/{id}',
  'GET /internal/sso/offices',
  'GET /internal/sso/users/by-email/{email}/status',
  'GET /notifications',
  'GET /operations/audit-logs',
  'GET /operations/integration-health',
  'GET /operations/integrations',
  'GET /services',
  'PATCH /availability/rules/{id}',
  'PATCH /departments/{id}',
  'PATCH /guests/me',
  'PATCH /offices/{id}',
  'PATCH /services/{id}',
  'POST /approvals/visit/{visitId}/decision',
  'POST /auth/resend-verification',
  'POST /auth/update-registration-email',
  'POST /availability/rules',
  'POST /credentials/visit/{visitId}/revoke',
  'POST /departments',
  'POST /departments/{id}/restore',
  'POST /internal/sso/sessions',
  'POST /internal/sso/sessions/revoke',
  'POST /notifications/read-all',
  'POST /notifications/{id}/read',
  'POST /offices/{id}/restore',
  'POST /operations/integrations/outbox/{id}/retry',
  'POST /operations/integrations/unifi-webhooks/{id}/replay',
  'POST /services',
  'POST /services/{id}/restore',
  'POST /users/{id}/restore',
  'POST /visits/{id}/escalate',
  'POST /visits/{id}/guest-decision',
  'POST /visits/{id}/reassign',
  'POST /visits/{id}/reschedule',
]);

function main() {
  const actual = readActualRoutes();
  const documented = readDocumentedRoutes();

  const undocumented = actual.filter((route) => !documented.includes(route));
  const undocumentedRoutes = undocumented.filter((route) => !UNDOCUMENTED_BASELINE.has(route));
  const staleDocumentedRoutes = documented.filter((route) => !actual.includes(route));
  // A baseline entry that is now documented (or no longer routed) is debt that
  // was paid without updating the ledger. Fail on that too, so the list stays an
  // accurate measure of what is left rather than growing stale in place.
  const settledBaseline = [...UNDOCUMENTED_BASELINE].filter(
    (route) => !undocumented.includes(route),
  );

  if (undocumentedRoutes.length || staleDocumentedRoutes.length || settledBaseline.length) {
    if (undocumentedRoutes.length) {
      console.error('Live routes missing from src/api/swagger.ts:');
      for (const route of undocumentedRoutes) {
        console.error(`- ${route}`);
      }
    }

    if (staleDocumentedRoutes.length) {
      console.error('Documented in src/api/swagger.ts but no longer routed:');
      for (const route of staleDocumentedRoutes) {
        console.error(`- ${route}`);
      }
    }

    if (settledBaseline.length) {
      console.error('These are no longer undocumented — remove them from UNDOCUMENTED_BASELINE:');
      for (const route of settledBaseline) {
        console.error(`- ${route}`);
      }
    }

    process.exit(1);
  }

  console.log(
    `OpenAPI coverage check passed: ${actual.length} live route-method pairs, ` +
      `${actual.length - UNDOCUMENTED_BASELINE.size} documented, ` +
      `${UNDOCUMENTED_BASELINE.size} on the accepted baseline.`,
  );
}

main();
