import type { ModelStatic, Model } from 'sequelize';

/**
 * Constrain a caller-supplied `sort_by` to a column the model actually has.
 *
 * Six list endpoints (guests, hosts, offices, departments, services, users)
 * passed the raw query-string value straight into Sequelize's `order:` clause.
 * That is not classic SQL injection — Sequelize quotes identifiers, so
 * `?sort_by=1;DROP TABLE users` becomes a quoted column name and not a
 * statement — but it is an unbounded foot-gun in two ways:
 *
 *   1. Any unknown column produces `SequelizeDatabaseError` from Postgres. Until
 *      errorHandler learned to answer that as a 400, it surfaced as an
 *      unhandled 500, logged at error level and reported to Sentry. Anyone
 *      could generate those at will, from a query string, on six endpoints.
 *   2. It quietly widens what a caller can order by to every column on the
 *      model, including ones a list endpoint has no business exposing an
 *      ordering over.
 *
 * Validating against `Model.getAttributes()` rather than a hand-written list
 * per module means the allowlist cannot drift away from the schema — a column
 * added later is sortable, a column renamed stops being silently accepted, and
 * there is no second place to remember to update.
 *
 * Unknown values fall back rather than throwing: sorting is a presentation
 * preference, and refusing the whole request because a saved bookmark carries a
 * stale sort key would be a worse experience than ignoring it.
 */
export function resolveSortColumn(
  model: ModelStatic<Model>,
  requested: unknown,
  fallback = 'created_at',
): string {
  const candidate = typeof requested === 'string' ? requested.trim() : '';
  if (!candidate) return fallback;

  const attributes = model.getAttributes();
  if (Object.prototype.hasOwnProperty.call(attributes, candidate)) return candidate;

  return fallback;
}

/** ASC or DESC, nothing else. */
export function resolveSortOrder(requested: unknown, fallback: 'ASC' | 'DESC' = 'DESC'): 'ASC' | 'DESC' {
  const candidate = String(requested ?? '').trim().toUpperCase();
  return candidate === 'ASC' || candidate === 'DESC' ? candidate : fallback;
}
