import { RunModel } from './runs.model';
import { enqueueRunJob } from '@/queues/run-queue';

interface CreateRunInput {
  workflowId: string;
  triggerId?: string;
  payload: Record<string, unknown>;
}

export const createRun = (input: CreateRunInput) => {
  return RunModel.create({
    workflow: input.workflowId,
    trigger: input.triggerId,
    payload: input.payload,
    status: 'pending',
  }).then(async (run) => {
    await enqueueRunJob(run.id);
    return run;
  });
};

export const listRuns = (workflowId: string) => {
  return RunModel.find({ workflow: workflowId }).sort({ createdAt: -1 }).lean();
};
