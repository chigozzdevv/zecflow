import { WorkflowModel } from './workflows.model';
import { WorkflowStatus, WorkflowGraph, WorkflowNode, WorkflowEdge } from './workflows.types';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { registerWorkflowSchedule, unregisterWorkflowSchedule } from '@/features/jobs/schedule-runner';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { BlockModel } from '@/features/blocks/blocks.model';
import { RunModel } from '@/features/runs/runs.model';
import { getBlockDefinition } from '@/features/blocks/blocks.registry';
import { Types } from 'mongoose';

type ResolvedDependency = { source: string; targetHandle?: string; sourceHandle?: string };

const GRID_COLUMNS = 4;
const GRID_X_START = 120;
const GRID_Y_START = 80;
const GRID_X_STEP = 220;
const GRID_Y_STEP = 140;
const MIN_SPREAD_PX = 140;

const computeGridPosition = (index: number) => ({
  x: GRID_X_START + (index % GRID_COLUMNS) * GRID_X_STEP,
  y: GRID_Y_START + Math.floor(index / GRID_COLUMNS) * GRID_Y_STEP,
});

export const normalizeGraphPositions = (graph: WorkflowGraph | null): WorkflowGraph | null => {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    return graph;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let needsFallback = false;
  const uniquePositions = new Set<string>();

  for (const node of graph.nodes) {
    const pos = node.position;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      needsFallback = true;
      break;
    }
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
    uniquePositions.add(`${pos.x}:${pos.y}`);
  }

  const spreadX = maxX - minX;
  const spreadY = maxY - minY;
  const tooClustered = uniquePositions.size <= Math.max(2, Math.ceil(graph.nodes.length / 3));
  if (!needsFallback && !tooClustered && (spreadX >= MIN_SPREAD_PX || spreadY >= MIN_SPREAD_PX)) {
    return graph;
  }

  const adjustedNodes = graph.nodes.map((node, idx) => ({
    ...node,
    position: computeGridPosition(idx),
  }));

  return { ...graph, nodes: adjustedNodes };
};

interface CreateWorkflowInput {
  name: string;
  description?: string;
  organizationId: string;
  triggerId?: string;
   datasetId?: string;
}

const mapCategoryToNodeType = (category: string): WorkflowNode['type'] => {
  switch (category) {
    case 'input':
      return 'input';
    case 'compute':
      return 'compute';
    case 'action':
      return 'action';
    case 'transform':
      return 'transform';
    case 'storage':
      return 'compute';
    default:
      return 'compute';
  }
};

const normalizeDependency = (dep: unknown): ResolvedDependency | null => {
  if (!dep) return null;
  if (typeof dep === 'string') return { source: dep };
  if (dep instanceof Types.ObjectId) return { source: dep.toString() };
  if (typeof dep === 'object' && dep !== null && 'source' in dep) {
    const record = dep as { source: unknown; targetHandle?: unknown; sourceHandle?: unknown };
    const source = record.source instanceof Types.ObjectId ? record.source.toString() : String(record.source);
    return {
      source,
      targetHandle: typeof record.targetHandle === 'string' ? record.targetHandle : undefined,
      sourceHandle: typeof record.sourceHandle === 'string' ? record.sourceHandle : undefined,
    };
  }
  return null;
};

export const buildGraphFromBlocks = async (workflowId: string): Promise<WorkflowGraph> => {
  const blocks = await BlockModel.find({ workflow: workflowId }).sort({ order: 1, createdAt: 1 }).lean();

  if (!blocks.length) {
    throw new AppError('Workflow has no blocks yet. Add blocks before publishing.', HttpStatus.BAD_REQUEST);
  }

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  for (const block of blocks as any[]) {
    const type = String(block.type);
    const definition = getBlockDefinition(type);
    if (!definition) {
      throw new AppError(`Unknown block type in workflow: ${type}`, HttpStatus.BAD_REQUEST);
    }

    const node: WorkflowNode = {
      id: String(block._id),
      blockId: definition.id,
      type: mapCategoryToNodeType(definition.category),
      position: block.position,
      data: (block.config ?? {}) as Record<string, any>,
      alias: block.alias as string | undefined,
      connector: block.connector ? String(block.connector) : undefined,
    };

    nodes.push(node);
  }

  for (const block of blocks as any[]) {
    if (!block.dependencies || !Array.isArray(block.dependencies)) continue;

    const config = (block.config ?? {}) as Record<string, any>;
    const inputSlots = (config.__inputSlots ?? {}) as Record<string, { source: string; output?: string }>;
    const sourceToHandle: Record<string, string> = {};
    for (const [handle, slot] of Object.entries(inputSlots)) {
      if (slot?.source) {
        sourceToHandle[slot.source] = handle;
      }
    }

    const normalizedDeps = block.dependencies
      .map(normalizeDependency)
      .filter((dep: ResolvedDependency | null): dep is ResolvedDependency => dep !== null);

    for (const dep of normalizedDeps) {
      const sourceId = dep.source;
      const targetId = String(block._id);
      const targetHandle = dep.targetHandle ?? sourceToHandle[sourceId];
      const sourceHandle = dep.sourceHandle ?? (targetHandle ? inputSlots[targetHandle]?.output : undefined);
      
      edges.push({
        id: `${sourceId}->${targetId}${targetHandle ? `-${targetHandle}` : ''}`,
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
      });
    }
  }

  return { nodes, edges };
};

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
    dataset: input.datasetId,
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
  if (status === 'published') {
    workflow.status = status;

    const graph = normalizeGraphPositions(await buildGraphFromBlocks(workflowId));
    if (!graph) {
      throw new AppError('Workflow graph missing nodes', HttpStatus.BAD_REQUEST);
    }
    workflow.graph = {
      ...graph,
      metadata: {
        name: workflow.name,
        description: workflow.description,
      },
    };

    await workflow.save();
    await registerWorkflowSchedule(workflow.id);
  } else {
    workflow.status = status;
    await workflow.save();
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
