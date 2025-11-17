import { ActionModel } from './actions.model';
import { getActionDefinition } from './actions.registry';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';

interface CreateActionInput {
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
  organizationId: string;
  userId: string;
}

export const createAction = async (input: CreateActionInput) => {
  const definition = getActionDefinition(input.type);
  if (!definition) {
    throw new AppError('Unknown action type', HttpStatus.BAD_REQUEST);
  }

  const parsed = definition.configSchema.parse(input.config);

  return ActionModel.create({
    workflow: input.workflowId,
    type: input.type,
    config: parsed,
    organization: input.organizationId,
    createdBy: input.userId,
  });
};

export const listActions = (workflowId: string) => ActionModel.find({ workflow: workflowId }).lean();
