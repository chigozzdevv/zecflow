import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/users/users.service';
import { createAction, listActions } from './actions.service';
import { actionRegistry } from './actions.registry';

export const createActionHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const action = await createAction({
    workflowId: req.body.workflowId,
    type: req.body.type,
    config: req.body.config ?? {},
    organizationId: user.organization.toString(),
    userId: user.id,
  });
  res.status(HttpStatus.CREATED).json({ action });
};

export const listActionsHandler = async (req: Request, res: Response): Promise<void> => {
  const { workflowId } = req.query;
  if (!workflowId || typeof workflowId !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'workflowId query required' });
    return;
  }
  const actions = await listActions(workflowId);
  res.json({ actions });
};

export const listActionDefinitions = (_req: Request, res: Response): void => {
  res.json({ actions: actionRegistry });
};
