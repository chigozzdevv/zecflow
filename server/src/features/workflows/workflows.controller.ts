import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { createWorkflow, listWorkflows, setWorkflowStatus, deleteWorkflow } from './workflows.service';

export const createWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflow = await createWorkflow({
    name: req.body.name,
    description: req.body.description,
    organizationId: user.organization.toString(),
    triggerId: req.body.triggerId,
  });
  res.status(HttpStatus.CREATED).json({ workflow });
};

export const listWorkflowsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflows = await listWorkflows(user.organization.toString());
  res.json({ workflows });
};

export const publishWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflow = await setWorkflowStatus(req.params.workflowId, 'published', user.organization.toString());
  res.json({ workflow });
};

export const deleteWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  await deleteWorkflow(req.params.workflowId, user.organization.toString());
  res.status(HttpStatus.NO_CONTENT).send();
};
