import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../../core/errors/AppError';
import { ErrorCodes } from '../../core/errors/errorCodes';

export const validateRequest = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as {
        body?: Request['body'];
        query?: Request['query'];
        params?: Request['params'];
      };
      if (parsed.body) {
        Object.defineProperty(req, 'body', { value: parsed.body, writable: true, enumerable: true });
      }
      if (parsed.query) {
        Object.defineProperty(req, 'query', { value: parsed.query, writable: true, enumerable: true });
      }
      if (parsed.params) {
        Object.defineProperty(req, 'params', { value: parsed.params, writable: true, enumerable: true });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
