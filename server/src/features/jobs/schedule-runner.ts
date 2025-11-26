import cron, { ScheduledTask } from 'node-cron';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { logger } from '@/utils/logger';
import { createRun } from '@/features/runs/runs.service';

const workflowSchedules = new Map<string, ScheduledTask>();

const scheduleWorkflow = async (workflowId: string, expression: string, triggerId: string) => {
  const task = cron.schedule(expression, async () => {
    try {
      await createRun({
        workflowId,
        triggerId,
        payload: { scheduledAt: new Date().toISOString() },
      });
    } catch (error) {
      logger.error({ err: error, workflowId }, 'Failed to enqueue scheduled run');
    }
  });

  workflowSchedules.set(workflowId, task);
  logger.info({ workflowId }, 'Scheduled workflow trigger registered');
};

export const unregisterWorkflowSchedule = (workflowId: string): void => {
  const task = workflowSchedules.get(workflowId);
  if (task) {
    task.stop();
    workflowSchedules.delete(workflowId);
    logger.info({ workflowId }, 'Scheduled workflow trigger removed');
  }
};

export const registerWorkflowSchedule = async (workflowId: string): Promise<void> => {
  const workflow = await WorkflowModel.findById(workflowId);
  if (!workflow || !workflow.trigger) {
    return;
  }
  const trigger = await TriggerModel.findById(workflow.trigger);
  if (!trigger || trigger.type !== 'schedule') {
    return;
  }
  const expression = (trigger.config as Record<string, unknown>)?.expression as string;
  if (!expression || !cron.validate(expression)) {
    logger.warn({ workflowId }, 'Invalid cron expression for schedule trigger');
    return;
  }
  unregisterWorkflowSchedule(workflowId);
  await scheduleWorkflow(workflowId, expression, trigger.id);
};

export const initializeTriggerSchedules = async (): Promise<void> => {
  const workflows = await WorkflowModel.find({ status: 'published', trigger: { $ne: null } });
  for (const workflow of workflows) {
    await registerWorkflowSchedule(workflow.id);
  }
};
