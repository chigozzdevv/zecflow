import { BlockModel } from './blocks.model';
import { getBlockDefinition } from './blocks.registry';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { Types } from 'mongoose';

interface CreateBlockInput {
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
  organizationId: string;
  position?: { x: number; y: number };
  order: number;
  alias?: string;
  dependencies?: string[];
  connectorId?: string;
}

export const createBlock = async (input: CreateBlockInput) => {
  const workflow = await WorkflowModel.findById(input.workflowId);
  if (!workflow || workflow.organization.toString() !== input.organizationId) {
    throw new AppError('Workflow not found', HttpStatus.NOT_FOUND);
  }

  const definition = getBlockDefinition(input.type);
  if (!definition) {
    throw new AppError('Unknown block type', HttpStatus.BAD_REQUEST);
  }

  const parsedConfig = definition.configSchema.parse(input.config);

  let dependencyIds: Types.ObjectId[] = [];
  if (input.dependencies && input.dependencies.length) {
    dependencyIds = input.dependencies.map((id) => new Types.ObjectId(id));
    const dependencyBlocks = await BlockModel.find({ _id: { $in: dependencyIds } });
    if (dependencyBlocks.some((block) => block.workflow.toString() !== input.workflowId)) {
      throw new AppError('Dependencies must belong to same workflow', HttpStatus.BAD_REQUEST);
    }
  }

  let connectorRef: Types.ObjectId | undefined;
  if (input.connectorId) {
    const connector = await ConnectorModel.findById(input.connectorId);
    if (!connector || connector.organization.toString() !== input.organizationId) {
      throw new AppError('Connector not found for organization', HttpStatus.NOT_FOUND);
    }
    connectorRef = connector._id as Types.ObjectId;
  }

  if (definition.requiresConnector && !connectorRef) {
    throw new AppError('Block requires connector', HttpStatus.BAD_REQUEST);
  }

  return BlockModel.create({
    workflow: input.workflowId,
    type: input.type,
    config: parsedConfig,
    position: input.position ?? { x: 0, y: 0 },
    organization: input.organizationId,
    order: input.order,
    alias: input.alias,
    dependencies: dependencyIds,
    connector: connectorRef,
  });
};

export const listBlocksForWorkflow = (workflowId: string) => {
  return BlockModel.find({ workflow: workflowId }).sort({ order: 1, createdAt: 1 }).lean();
};
