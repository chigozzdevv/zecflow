import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/users/users.service';
import { sendShieldedTransfer, createTransactionWatcher, listWatchers } from './zcash-execution.service';

export const sendTransactionHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const txId = await sendShieldedTransfer(req.body.address, req.body.amount, req.body.memo);
  res.json({ txId });
};

export const createWatcherHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const watcher = await createTransactionWatcher({
    organizationId: user.organization.toString(),
    userId: user.id,
    config: req.body ?? {},
  });
  res.status(HttpStatus.CREATED).json({ watcher });
};

export const listWatcherHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const watchers = await listWatchers(user.organization.toString());
  res.json({ watchers });
};
