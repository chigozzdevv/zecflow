import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/users/users.service';
import { createAgent, listAgents, updateAgentStatus } from './agents.service';

export const createAgentHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const agent = await createAgent({
    name: req.body.name,
    description: req.body.description,
    workflowId: req.body.workflowId,
    organizationId: user.organization.toString(),
  });
  res.status(HttpStatus.CREATED).json({ agent });
};

export const listAgentsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const agents = await listAgents(user.organization.toString());
  res.json({ agents });
};

export const activateAgentHandler = async (req: Request, res: Response): Promise<void> => {
  const agent = await updateAgentStatus(req.params.agentId, 'active');
  res.json({ agent });
};
