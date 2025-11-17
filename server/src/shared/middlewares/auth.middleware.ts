import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '@/config/security';
import { HttpStatus } from '@/utils/http-status';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    roles: string[];
  };
}

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Missing authorization header' });
    return;
  }

  const token = header.replace('Bearer ', '').trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch (error) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Invalid token' });
  }
};
