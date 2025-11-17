import { Request, Response } from 'express';
import { HttpStatus } from '@/utils/http-status';
import { createRun, listRuns } from './runs.service';

export const createRunHandler = async (req: Request, res: Response): Promise<void> => {
  const run = await createRun({
    workflowId: req.body.workflowId,
    triggerId: req.body.triggerId,
    payload: req.body.payload ?? {},
  });
  res.status(HttpStatus.CREATED).json({ run });
};

export const listRunsHandler = async (req: Request, res: Response): Promise<void> => {
  const workflowId = req.query.workflowId;
  if (!workflowId || typeof workflowId !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'workflowId query required' });
    return;
  }
  const runs = await listRuns(workflowId);
  res.json({ runs });
};
