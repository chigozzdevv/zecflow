import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { createBlock, listBlocksForWorkflow, updateBlock, deleteBlock } from './blocks.service';
import { blockRegistry } from './blocks.registry';
import { nillionBlockRegistry } from './nillion-blocks.registry';

export const createBlockHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const block = await createBlock({
    workflowId: req.body.workflowId,
    type: req.body.type,
    config: req.body.config ?? {},
    position: req.body.position,
    organizationId: user.organization.toString(),
    order: req.body.order ?? 0,
    alias: req.body.alias,
    dependencies: req.body.dependencies,
    connectorId: req.body.connectorId,
  });
  res.status(HttpStatus.CREATED).json({ block });
};

export const listBlocksHandler = async (req: Request, res: Response): Promise<void> => {
  const { workflowId } = req.query;
  if (!workflowId || typeof workflowId !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'workflowId query required' });
    return;
  }
  const blocks = await listBlocksForWorkflow(workflowId);
  res.json({ blocks });
};

export const updateBlockHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const { blockId } = req.params as { blockId: string };

  const block = await updateBlock({
    blockId,
    organizationId: user.organization.toString(),
    position: req.body.position,
    dependencies: req.body.dependencies,
    alias: req.body.alias,
    config: req.body.config,
  });

  res.json({ block });
};

export const deleteBlockHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const { blockId } = req.params as { blockId: string };

  await deleteBlock({
    blockId,
    organizationId: user.organization.toString(),
  });

  res.status(HttpStatus.NO_CONTENT).send();
};

export const listBlockDefinitions = (_req: Request, res: Response): void => {
  const nillionBlocks = nillionBlockRegistry.map((block) => ({
    id: block.id,
    name: block.name,
    description: block.description,
    category: block.category,
    handler: 'nillion' as const,
    inputs: block.inputs,
    outputs: block.outputs,
    icon: block.icon,
    color: block.color,
    tags: block.tags,
  }));

  res.json({
    blocks: blockRegistry,
    nillionBlocks,
  });
};
