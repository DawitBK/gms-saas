import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../../core/errors/AppError";
import { logger } from "../../core/logger/logger";
import { appConfig } from "../../config/app.config";
import { captureException } from "../services/sentry.service";
import { sendError } from "../../core/utils/helpers";

/**
 * Humanize field paths and issues... (Keeping existing helper functions for brevity in this view)
 */
function humanizeFieldPath(segments: (string | number)[]): string {
  const filtered = segments.filter(s => typeof s === "number" || !["body", "params", "query"].includes(String(s)));
  if (filtered.length === 0) return "This field";
  const last = String(filtered[filtered.length - 1]);
  return last.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function humanizeZodIssue(issue: any): string {
  const field = humanizeFieldPath(issue.path);
  // Zod's generated defaults use known prefixes (e.g. "Too small: expected number to be >=1");
  // any other message was explicitly authored on the schema and must win over the generic copy.
  const message = typeof issue.message === "string" ? issue.message : "";
  const isGeneratedMessage = /^(Too small\b|Too big\b|Invalid input\b|Invalid string\b|Expected |Required$|Unrecognized key)/.test(message);
  if (message && !isGeneratedMessage) return message;
  switch (issue.code) {
    case "too_small": return `${field} is required.`;
    case "too_big": return `${field} is too long.`;
    case "invalid_string": return `${field} is not in a valid format.`;
    case "invalid_type": return issue.message.includes("Required") ? `${field} is required.` : `${field} has an invalid value.`;
    case "invalid_enum_value": return `${field} must be one of the allowed options.`;
    default: return issue.message || `${field} is invalid.`;
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = (req as any).requestId || null;

  // 1. Handle Zod Validation Errors
  if (err instanceof ZodError) {
    const details = err.issues.map((e: any) => ({
      path: e.path.join("."),
      message: humanizeZodIssue(e),
    }));
    return sendError(res, details[0].message, 400, "INVALID_INPUT", details);
  }

  // 2. Handle Sequelize Unique Constraint Errors (Hardened Database Protection)
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors?.[0]?.path || 'entity';
    const humanField = field.replace(/_/g, ' ').replace(/^./, (c: string) => c.toUpperCase());
    return sendError(res, `${humanField} already exists and must be unique.`, 409, "DUPLICATE_ENTRY", {
      field: field,
      value: err.errors?.[0]?.value
    });
  }

  // 2b. Foreign-key violations — a referenced office, department, service or
  // host does not exist. Caller error, not server error.
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return sendError(
      res,
      'One of the referenced records does not exist or is still in use.',
      400,
      'INVALID_REFERENCE',
    );
  }

  /**
   * 2c. Malformed values that only Postgres rejects — `?office_id=abc` on an
   * integer column, an out-of-range BIGINT, a bad date literal.
   *
   * These reached section 4 and were reported as a 500 with "A critical
   * internal error occurred", which is both wrong (the caller sent bad input)
   * and expensive: every one of them was logged at error level and sent to
   * Sentry, so a client bug looked like a production incident. It is the same
   * error class a validation gap lets through — see the `.merge()` bug fixed
   * in visit.schema.ts, which is exactly how such a value reached the driver.
   *
   * Deliberately does not echo the database's own message, which quotes the
   * failing SQL and column names.
   */
  if (err.name === 'SequelizeDatabaseError') {
    logger.warn(
      { err, requestId, path: req.originalUrl },
      'Database rejected a request value — treating as bad input, not a server fault',
    );
    return sendError(
      res,
      'One or more values in this request are not in a valid format.',
      400,
      'INVALID_INPUT',
    );
  }

  // 3. Handle Explicit App Errors
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.fatal({ err, requestId }, "CRITICAL SYSTEM FAILURE");
      captureException(err, { requestId, userId: req.user?.id, path: req.originalUrl });
    }
    return sendError(res, err.message, err.statusCode, err.code, err.details);
  }

  // 4. Handle Unhandled Native Errors
  logger.error({ err, requestId }, "Unhandled Exception Trapped");
  captureException(err, { requestId, userId: req.user?.id, path: req.originalUrl });

  const isDev = appConfig.isProduction === false;
  const message = isDev ? `Internal Error: ${err.message}` : "A critical internal error occurred.";
  
  return sendError(res, message, 500, "INTERNAL_ERROR", isDev ? { 
    stack: err.stack,
    original: err.original || err.errors || null
  } : null);
};
