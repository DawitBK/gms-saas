import { ErrorCodes } from './errorCodes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodes;
  public readonly isOperational: boolean;
  public readonly details: any;

  constructor(
    message: string,
    code: ErrorCodes,
    statusCode: number = 400,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain

    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this);
  }
}
