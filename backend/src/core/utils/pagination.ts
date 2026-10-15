/**
 * Pagination utilities for dropdown and paginated list contexts.
 */

/** Safe ceiling for any dropdown/select data source */
export const DROPDOWN_LIMIT = 2000;

/** Default for paginated tables when not specified */
export const DEFAULT_PAGE_LIMIT = 20;

/** Hard cap for paginated tables to prevent abuse */
export const MAX_PAGE_LIMIT = 200;

/**
 * Resolves a raw limit parameter into a safe integer based on context.
 *
 * @param raw - Raw limit value from query (string, number, undefined, 'all')
 * @param mode - 'dropdown' for selects/comboboxes, 'paginated' for tables
 * @returns Safe limit number
 */
export function resolveLimit(
  raw: unknown,
  mode: 'dropdown' | 'paginated' = 'paginated'
): number {
  // Treat 'all', undefined, null, or empty string as "give me the mode default"
  if (raw === 'all' || raw === undefined || raw === null || raw === '') {
    return mode === 'dropdown' ? DROPDOWN_LIMIT : DEFAULT_PAGE_LIMIT;
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return mode === 'dropdown' ? DROPDOWN_LIMIT : DEFAULT_PAGE_LIMIT;
  }

  if (mode === 'paginated') {
    return Math.min(n, MAX_PAGE_LIMIT);
  }

  // dropdown mode
  return Math.min(n, DROPDOWN_LIMIT);
}
