import { BlockModel } from './blocks.model';
import { getBlockDefinition } from './blocks.registry';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { Types } from 'mongoose';

type DependencyInput =
  | string
  | {
      source: string;
      targetHandle?: string;
      sourceHandle?: string;
    };

type NormalizedDependency = {
  source: string;
  targetHandle?: string;
  sourceHandle?: string;
};

const normalizeDependencyInput = (deps?: DependencyInput[]): NormalizedDependency[] => {
  if (!deps || !Array.isArray(deps)) return [];
  return deps
    .map((dep) => {
      if (!dep) return null;
      if (typeof dep === 'string') {
        return { source: dep };
      }
      if (typeof dep === 'object' && typeof dep.source === 'string' && dep.source.length) {
        return { source: dep.source, targetHandle: dep.targetHandle, sourceHandle: dep.sourceHandle };
      }
      return null;
    })
    .filter((dep): dep is NormalizedDependency => dep !== null);
};

interface CreateBlockInput {
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
  organizationId: string;
  position?: { x: number; y: number };
  order: number;
  alias?: string;
  dependencies?: DependencyInput[];
  connectorId?: string;
}

interface UpdateBlockInput {
  blockId: string;
  organizationId: string;
  position?: { x: number; y: number };
  dependencies?: DependencyInput[];
  alias?: string;
  config?: Record<string, unknown>;
}

interface DeleteBlockInput {
  blockId: string;
  organizationId: string;
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

  const normalizedDeps = normalizeDependencyInput(input.dependencies);

  if (normalizedDeps.length) {
    const dependencyIds = normalizedDeps.map((dep) => new Types.ObjectId(dep.source));
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
  
  if (definition.requiresConnector && !connectorRef && workflow.trigger) {
    const trigger = await TriggerModel.findById(workflow.trigger);
    if (trigger && trigger.connector) {
      const connector = await ConnectorModel.findById(trigger.connector);
      if (connector && connector.organization.toString() === input.organizationId) {
        connectorRef = connector._id as Types.ObjectId;
      }
    }
  }

  if (definition.requiresConnector && !connectorRef) {
    throw new AppError('Block requires connector', HttpStatus.BAD_REQUEST);
  }

  const created = await BlockModel.create({
    workflow: input.workflowId,
    type: input.type,
    config: parsedConfig,
    position: input.position ?? { x: 0, y: 0 },
    organization: input.organizationId,
    order: input.order,
    alias: input.alias,
    dependencies: normalizedDeps.map((dep) => ({
      source: new Types.ObjectId(dep.source),
      targetHandle: dep.targetHandle,
      sourceHandle: dep.sourceHandle,
    })),
    connector: connectorRef,
  });
  return serializeBlock(created);
};

const serializeDependency = (dep: any) => {
  if (!dep) return null;
  if (typeof dep === 'string') return { source: dep };
  if (dep instanceof Types.ObjectId) return { source: dep.toString() };
  if (typeof dep === 'object' && dep.source) {
    const source = dep.source instanceof Types.ObjectId ? dep.source.toString() : String(dep.source);
    return { source, targetHandle: dep.targetHandle, sourceHandle: dep.sourceHandle };
  }
  return null;
};

const serializeBlock = (block: any) => {
  if (!block) return block;
  const plain = block.toObject ? block.toObject() : block;
  const deps = Array.isArray(plain.dependencies)
    ? plain.dependencies.map(serializeDependency).filter((dep: any): dep is NormalizedDependency => !!dep)
    : [];
  return { ...plain, dependencies: deps };
};

export const listBlocksForWorkflow = async (workflowId: string) => {
  const blocks = await BlockModel.find({ workflow: workflowId }).sort({ order: 1, createdAt: 1 }).lean();
  return blocks.map(serializeBlock);
};
export const updateBlock = async (input: UpdateBlockInput) => {
  const block = await BlockModel.findById(input.blockId);
  if (!block || block.organization.toString() !== input.organizationId) {
    throw new AppError('Block not found', HttpStatus.NOT_FOUND);
  }

  if (input.config) {
    const definition = getBlockDefinition(block.type);
    if (!definition) {
      throw new AppError('Unknown block type', HttpStatus.BAD_REQUEST);
    }
    const parsedConfig = definition.configSchema.parse(input.config) as Record<string, unknown>;
    
    // Merge __inputSlots instead of replacing to handle concurrent connections
    const existingConfig = (block.config ?? {}) as Record<string, unknown>;
    const existingSlots = (existingConfig.__inputSlots ?? {}) as Record<string, unknown>;
    const newSlots = (parsedConfig.__inputSlots ?? {}) as Record<string, unknown>;
    
    block.config = {
      ...existingConfig,
      ...parsedConfig,
      __inputSlots: { ...existingSlots, ...newSlots },
    } as any;
  }

  if (input.position) {
    block.position = input.position;
  }

  if (typeof input.alias === 'string') {
    block.alias = input.alias;
  }

  if (input.dependencies) {
    const normalizedDeps = normalizeDependencyInput(input.dependencies);
    const dependencyIds = normalizedDeps.map((dep) => new Types.ObjectId(dep.source));
    const dependencyBlocks = await BlockModel.find({ _id: { $in: dependencyIds } });
    if (dependencyBlocks.some((b) => b.workflow.toString() !== block.workflow.toString())) {
      throw new AppError('Dependencies must belong to same workflow', HttpStatus.BAD_REQUEST);
    }
    block.dependencies = normalizedDeps.map((dep) => ({
      source: new Types.ObjectId(dep.source),
      targetHandle: dep.targetHandle,
      sourceHandle: dep.sourceHandle,
    })) as any;
  }

  await block.save();
  return serializeBlock(block);
};

export const deleteBlock = async (input: DeleteBlockInput): Promise<void> => {
  const block = await BlockModel.findById(input.blockId);
  if (!block || block.organization.toString() !== input.organizationId) {
    throw new AppError('Block not found', HttpStatus.NOT_FOUND);
  }

  await block.deleteOne();
};
