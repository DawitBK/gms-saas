import { Request, Response } from "express";

export const ok = <T>(res: Response, data: T) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      request_id: (res.req as any)?.requestId || null,
    },
  });
};

export const created = <T>(res: Response, data: T) => {
  return res.status(201).json({
    success: true,
    data,
    meta: {
      request_id: (res.req as any)?.requestId || null,
    },
  });
};

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: {
      request_id: (res.req as any)?.requestId || null,
    },
  });
};

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters?: Record<string, unknown> | null;
  sort?: { by?: string; order?: string } | null;
  summary?: Record<string, any>;
  stats?: any;
  request_id?: string;
}

export const page = <T>(
  res: Response,
  data: T[],
  meta: Omit<PaginationMeta, "request_id">,
) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      ...meta,
      request_id: (res.req as any)?.requestId || null,
    },
  });
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      ...meta,
      request_id: meta.request_id || (res.req as any)?.requestId || null,
    },
  });
};

export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 400,
  code?: string,
  details?: any
) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: code || 'INTERNAL_ERROR',
      details: details || null,
    },
    meta: {
      request_id: (res.req as any)?.requestId || null,
      timestamp: new Date().toISOString()
    },
  });
};
