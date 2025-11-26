import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { getCredits, addCredits, getTransactionHistory, CREDIT_COSTS } from './billing.service';

export const getCreditsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const credits = await getCredits(user.organization.toString());
  res.json({ credits });
};

export const addCreditsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const { amount, reason } = req.body;
  const result = await addCredits(user.organization.toString(), amount, reason);
  res.json(result);
};

export const getCreditCostsHandler = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({ costs: CREDIT_COSTS });
};

export const getTransactionHistoryHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const transactions = await getTransactionHistory(user.organization.toString(), limit);
  res.json({ transactions });
};