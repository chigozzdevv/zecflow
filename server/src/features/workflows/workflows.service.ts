import { WorkflowModel } from './workflows.model';
import { WorkflowStatus } from './workflows.types';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { registerWorkflowSchedule, unregisterWorkflowSchedule } from '@/features/jobs/schedule-runner';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { BlockModel } from '@/features/blocks/blocks.model';
import { RunModel } from '@/features/runs/runs.model';

interface CreateWorkflowInput {
  name: string;
  description?: string;
  organizationId: string;
  triggerId?: string;
}

export const createWorkflow = async (input: CreateWorkflowInput) => {
  if (input.triggerId) {
    const trigger = await TriggerModel.findById(input.triggerId);
    if (!trigger || trigger.organization.toString() !== input.organizationId) {
      throw new AppError('Trigger not found', HttpStatus.NOT_FOUND);
    }
  }

  return WorkflowModel.create({
    name: input.name,
    description: input.description,
    organization: input.organizationId,
    trigger: input.triggerId,
  });
};

export const listWorkflows = (organizationId: string) => {
  return WorkflowModel.find({ organization: organizationId }).lean();
};

export const setWorkflowStatus = async (
  workflowId: string,
  status: WorkflowStatus,
  organizationId?: string,
) => {
  const workflow = await WorkflowModel.findById(workflowId);
  if (!workflow || (organizationId && workflow.organization.toString() !== organizationId)) {
    throw new AppError('Workflow not found', HttpStatus.NOT_FOUND);
  }
  workflow.status = status;
  await workflow.save();

  if (status === 'published') {
    await registerWorkflowSchedule(workflow.id);
  } else {
    unregisterWorkflowSchedule(workflow.id);
  }
  return workflow;
};

export const deleteWorkflow = async (workflowId: string, organizationId: string): Promise<void> => {
  const workflow = await WorkflowModel.findById(workflowId);
  if (!workflow || workflow.organization.toString() !== organizationId) {
    throw new AppError('Workflow not found', HttpStatus.NOT_FOUND);
  }

  unregisterWorkflowSchedule(workflow.id);

  await BlockModel.deleteMany({ workflow: workflowId });
  await RunModel.deleteMany({ workflow: workflowId });

  await WorkflowModel.deleteOne({ _id: workflowId });
};
