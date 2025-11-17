import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { register, login, findUserById, toPublic } from './auth.service';
import { HttpStatus } from '@/utils/http-status';

export const registerHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await register(req.body);
  res.status(HttpStatus.CREATED).json(result);
};

export const loginHandler = async (req: Request, res: Response): Promise<void> => {
  const result = await login(req.body);
  res.json(result);
};

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  res.json({ user: toPublic(user) });
};
