import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { HttpStatus } from '@/utils/http-status';

export const validate = (schema: ZodTypeAny) => async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ message: 'Validation failed', error });
  }
};
