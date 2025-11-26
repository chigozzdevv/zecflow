import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { createRun, listRuns } from './runs.service';

export const createRunHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const workflow = await WorkflowModel.findById(req.body.workflowId);
  if (!workflow || workflow.organization.toString() !== user.organization.toString()) {
    res.status(HttpStatus.FORBIDDEN).json({ message: 'Workflow not found' });
    return;
  }

  const run = await createRun({
    workflowId: req.body.workflowId,
    triggerId: req.body.triggerId,
    payload: req.body.payload ?? {},
  });
  res.status(HttpStatus.CREATED).json({ run });
};

export const listRunsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const workflowId = req.query.workflowId;
  if (!workflowId || typeof workflowId !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'workflowId query required' });
    return;
  }

  const workflow = await WorkflowModel.findById(workflowId);
  if (!workflow || workflow.organization.toString() !== user.organization.toString()) {
    res.status(HttpStatus.FORBIDDEN).json({ message: 'Workflow not found' });
    return;
  }

  const runs = await listRuns(workflowId);
  res.json({ runs });
};
