import { Request, Response } from 'express';
import { register, login } from './auth.service';
import { HttpStatus } from '@/utils/http-status';

export const registerHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await register(req.body);
  res.status(HttpStatus.CREATED).json(result);
};

export const loginHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await login(req.body);
  res.json(result);
};
