import { AgentModel } from './agents.model';
import { AgentStatus } from './agents.types';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';

interface CreateAgentInput {
  name: string;
  description?: string;
  workflowId: string;
  organizationId: string;
}

export const createAgent = (input: CreateAgentInput) => {
  return AgentModel.create({
    name: input.name,
    description: input.description,
    workflow: input.workflowId,
    organization: input.organizationId,
  });
};

export const listAgents = (organizationId: string) => {
  return AgentModel.find({ organization: organizationId }).lean();
};

export const updateAgentStatus = async (agentId: string, status: AgentStatus) => {
  const agent = await AgentModel.findById(agentId);
  if (!agent) {
    throw new AppError('Agent not found', HttpStatus.NOT_FOUND);
  }
  agent.status = status;
  await agent.save();
  return agent;
};
