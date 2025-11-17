import { NextFunction, Request, Response } from 'express';
import { AppError } from '@/shared/errors/app-error';
import { defaultErrorMap } from '@/shared/errors/error-map';
import { logger } from '@/utils/logger';
import { HttpStatus } from '@/utils/http-status';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  const status = err instanceof AppError
    ? err.statusCode
    : defaultErrorMap[err.name] || HttpStatus.INTERNAL_SERVER_ERROR;

  if (status >= 500) {
    logger.error({ err }, err.message);
  }

  res.status(status).json({
    message: err.message,
    details: err instanceof AppError ? err.details : undefined,
  });
};
