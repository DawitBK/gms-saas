import { z } from 'zod';

/**
 * Shared shape for the spreadsheet bulk-import endpoints.
 *
 * Neither `POST /users/bulk-import` nor `POST /guests/bulk-import` had a
 * schema. The only check was `Array.isArray(rows)` inside the controller,
 * which threw a bare `Error` rather than an AppError — so a malformed payload
 * surfaced as an unhandled 500 rather than a 400 with a message.
 *
 * The row cap is the part that matters. `user.service.bulkImport` wraps the
 * ENTIRE batch in one database transaction with no bound on its size, and the
 * global JSON body limit is 10mb, so a single upload could hold one
 * transaction open across tens of thousands of rows. That blocks vacuum,
 * holds locks on `users`, `hosts` and `host_profiles` for the duration, and —
 * because the transaction is all-or-nothing — one bad row at the end silently
 * discards every row that succeeded before it, with the operator left to guess
 * which of the 20,000 lines was at fault.
 *
 * 1,000 rows is comfortably above any real org chart this is used for and
 * small enough that a failed batch is something a person can actually look
 * through. Larger imports are split into several uploads, which also makes the
 * all-or-nothing behaviour tolerable.
 */
export const MAX_BULK_IMPORT_ROWS = 1000;

export const bulkImportSchema = z.object({
  body: z.object({
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .min(1, 'The file contained no rows to import.')
      .max(
        MAX_BULK_IMPORT_ROWS,
        `Import files are limited to ${MAX_BULK_IMPORT_ROWS} rows. The whole batch is applied as a single transaction, so a larger file both holds database locks for a long time and discards every successful row if any one row fails. Split the file and upload it in parts.`,
      ),
  }),
});
