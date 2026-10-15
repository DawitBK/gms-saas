import { z } from "zod";

const toOptionalPositiveInt = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}, z.number().int().positive().optional());

const toOptionalBooleanString = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value).toLowerCase();
}, z.enum(["true", "false"]).optional());

export const idParamSchema = z.object({
  params: z
    .object({
      id: z.string().regex(/^\d+$/).transform(Number),
    })
    .passthrough(),
});

/**
 * The bare field shape, exported so module schemas can EXTEND it instead of
 * merging on top of `collectionQuerySchema`.
 *
 * `listVisitsQuerySchema` used `collectionQuerySchema.merge(z.object({ query:
 * ... }))`. Both operands have a `query` key, and `merge` is a shallow
 * last-one-wins on that key — so the entire shape below was replaced by the
 * visit-specific one rather than combined with it. Everything defined here
 * (page, limit, office_id, department_id, sort_by, the alias transforms, the
 * page/limit defaults) silently stopped being validated on `GET /visits`, and
 * `.passthrough()` meant it all arrived at the service as raw strings. A
 * super_admin calling `GET /visits?office_id=abc` reached Postgres with a
 * non-numeric value and got an unhandled 500.
 *
 * `.extend()` on this base composes, which is what was intended.
 */
export const collectionQueryFields = z.object({
      page: toOptionalPositiveInt,
      limit: toOptionalPositiveInt,
      q: z.string().optional(),
      status: z.string().optional(),
      status_group: z.string().optional(),
      office_id: toOptionalPositiveInt,
      department_id: toOptionalPositiveInt,
      host_id: toOptionalPositiveInt,
      guest_id: toOptionalPositiveInt,
      include_archived: toOptionalBooleanString,
      from: z.string().optional(),
      to: z.string().optional(),
      sort_by: z.string().optional(),
      sort_order: z
        .enum(["asc", "desc", "ASC", "DESC"])
        .optional()
        .transform((value) => value?.toUpperCase()),
      // One-release aliases (compat mode)
      statusGroup: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      officeId: toOptionalPositiveInt,
      departmentId: toOptionalPositiveInt,
      hostId: toOptionalPositiveInt,
      guestId: toOptionalPositiveInt,
      search: z.string().optional(),
      hasCredential: toOptionalBooleanString,
});

/** The alias/default normalisation applied on top of `collectionQueryFields`. */
export const normalizeCollectionQuery = <T extends Record<string, any>>(query: T) => ({
  ...query,
  q: query.q ?? query.search,
  status_group: query.status_group ?? query.statusGroup,
  from: query.from ?? query.startDate,
  to: query.to ?? query.endDate,
  office_id: query.office_id ?? query.officeId,
  department_id: query.department_id ?? query.departmentId,
  host_id: query.host_id ?? query.hostId,
  guest_id: query.guest_id ?? query.guestId,
  has_credential: query.hasCredential,
  page: query.page ?? 1,
  limit: query.limit ?? 20,
});

export const collectionQuerySchema = z.object({
  query: collectionQueryFields.passthrough().transform(normalizeCollectionQuery),
});

export const paginationQuerySchema = collectionQuerySchema;

export const dateRangeQuerySchema = z.object({
  query: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .passthrough()
    .transform((query) => ({
      ...query,
      from: query.from ?? query.startDate,
      to: query.to ?? query.endDate,
    })),
});

export const officeFilterSchema = z.object({
  query: z
    .object({
      office_id: toOptionalPositiveInt,
      officeId: toOptionalPositiveInt,
      include_archived: toOptionalBooleanString,
    })
    .passthrough()
    .transform((query) => ({
      ...query,
      office_id: query.office_id ?? query.officeId,
      include_archived: query.include_archived ?? "false",
    })),
});
