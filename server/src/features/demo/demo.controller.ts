import { Request, Response } from 'express';
import { HttpStatus } from '@/utils/http-status';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { DemoSubmissionModel } from './demo.model';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { DatasetModel } from '@/features/datasets/datasets.model';
import { buildGraphFromBlocks } from '@/features/workflows/workflows.service';
import type { WorkflowGraph } from '@/features/workflows/workflows.types';

import { logger } from '@/utils/logger';

export const demoLoanResultHandler = async (req: Request, res: Response): Promise<void> => {
  const body = req.body ?? {};
  res.status(HttpStatus.OK).json({ received: true, body });
};

const getDemoLoanWorkflow = async () => {
  const demoLoanWorkflowId = process.env.DEMO_LOAN_WORKFLOW_ID;
  if (demoLoanWorkflowId) {
    const workflow = await WorkflowModel.findById(demoLoanWorkflowId).lean();
    if (workflow && workflow.status === 'published') {
      return workflow;
    }
  }
  return WorkflowModel.findOne({ status: 'published' }).lean();
};

const ensureWorkflowGraph = async (workflow: any): Promise<WorkflowGraph | null> => {
  if (workflow?.graph && Array.isArray(workflow.graph.nodes) && workflow.graph.nodes.length > 0) {
    return workflow.graph as WorkflowGraph;
  }

  if (!workflow?._id) {
    return null;
  }

  try {
    const builtGraph = await buildGraphFromBlocks(workflow._id.toString());
    return {
      ...builtGraph,
      metadata:
        (workflow.graph as WorkflowGraph | undefined)?.metadata ?? {
          name: workflow.name,
          description: workflow.description,
        },
    } satisfies WorkflowGraph;
  } catch (err) {
    logger.warn({ err, workflowId: workflow._id?.toString?.() }, 'Failed to rebuild workflow graph for demo response');
    return null;
  }
};

const GRID_COLUMNS = 4;
const GRID_X_START = 120;
const GRID_Y_START = 80;
const GRID_X_STEP = 220;
const GRID_Y_STEP = 140;

const computeGridPosition = (index: number) => ({
  x: GRID_X_START + (index % GRID_COLUMNS) * GRID_X_STEP,
  y: GRID_Y_START + Math.floor(index / GRID_COLUMNS) * GRID_Y_STEP,
});

const normalizeGraphPositions = (graph: WorkflowGraph | null): WorkflowGraph | null => {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    return graph;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let needsFallback = false;

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
  }

  const spreadX = maxX - minX;
  const spreadY = maxY - minY;
  if (!needsFallback && (spreadX >= 10 || spreadY >= 10)) {
    return graph;
  }

  const adjustedNodes = graph.nodes.map((node, idx) => ({
    ...node,
    position: computeGridPosition(idx),
  }));

  logger.debug({ workflowId: graph.metadata?.name }, 'Applied fallback workflow graph layout');
  return { ...graph, nodes: adjustedNodes };
};

export const demoLoanHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      income,
      existingDebt,
      age,
      country,
      requestedAmount,
      userDid,
    } = req.body ?? {};

    const workflow = await getDemoLoanWorkflow();
    if (!workflow) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan workflow not found or not published' });
      return;
    }

    let collectionId: string | null = null;
    if (workflow.dataset) {
      const ds = await DatasetModel.findById(workflow.dataset).lean();
      if (ds && typeof ds.nildbCollectionId === 'string') {
        collectionId = ds.nildbCollectionId;
      }
    }

    if (!collectionId) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Loan collection not configured in workflow dataset' });
      return;
    }

    const numericIncome = Number(income);
    const numericDebt = Number(existingDebt);
    const numericAge = Number(age);
    const numericRequested = Number(requestedAmount);

    if (
      typeof fullName !== 'string' ||
      typeof country !== 'string' ||
      !fullName.trim() ||
      !country.trim() ||
      Number.isNaN(numericIncome) ||
      Number.isNaN(numericDebt) ||
      Number.isNaN(numericAge) ||
      Number.isNaN(numericRequested)
    ) {
      res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid loan payload' });
      return;
    }

    let stateKey: string;
    try {
      const { v4: uuidv4 } = await import('uuid');
      const docKey = uuidv4();
      await nildbService.putDocument(
        collectionId,
        docKey,
        {
          fullName: fullName.trim(),
          country: country.trim(),
          income: numericIncome,
          existingDebt: numericDebt,
          age: numericAge,
          requestedAmount: numericRequested,
          source: 'demo-loan-app',
          userDid: typeof userDid === 'string' && userDid.length ? userDid : undefined,
        },
        undefined,
        { encryptAll: true },
      );
      stateKey = `${collectionId}:${docKey}`;
    } catch (err) {
      logger.error({ err }, 'Failed to store loan payload');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to store encrypted loan data' });
      return;
    }

    const run = await createRun({
      workflowId: (workflow as any)._id.toString(),
      payload: {
        source: 'demo-loan-app',
        stateKey,
      },
    });

    res.status(HttpStatus.OK).json({
      stateKey,
      status: 'running',
      runId: run.id,
      workflowId: (workflow as any)._id.toString(),
    });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan evaluation failed' });
  }
};

export const demoLoanInboxHandler = async (req: Request, res: Response): Promise<void> => {
  const workflow = await getDemoLoanWorkflow();
  if (!workflow) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan workflow not found or not published' });
    return;
  }

  const maxBatchRaw = typeof req.query.maxBatch === 'string' ? parseInt(req.query.maxBatch, 10) : NaN;
  const maxBatch = Number.isFinite(maxBatchRaw) && maxBatchRaw > 0 && maxBatchRaw <= 200 ? maxBatchRaw : 50;

  const items = await DemoSubmissionModel.find({ processed: false })
    .sort({ createdAt: 1 })
    .limit(maxBatch)
    .lean();

  if (items.length === 0) {
    res.json([]);
    return;
  }

  const ids = items.map((i) => i._id);
  await DemoSubmissionModel.updateMany({ _id: { $in: ids } }, { $set: { processed: true } });

  const runs = await Promise.all(
    items.map((item) =>
      createRun({
        workflowId: (workflow as any)._id.toString(),
        payload: {
          source: 'demo-loan-app',
          stateKey: item.stateKey,
        },
      }),
    ),
  );

  res.json(
    runs.map((run, idx) => ({
      runId: run.id,
      submissionId: items[idx]._id,
      stateKey: items[idx].stateKey,
    })),
  );
};

export const demoMedicalHandler = async (req: Request, res: Response): Promise<void> => {
  const { symptoms, age, shieldResult } = req.body ?? {};

  if (!symptoms || typeof age !== 'number') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid payload' });
    return;
  }

  const demoMedicalWorkflowId = process.env.DEMO_MEDICAL_WORKFLOW_ID;
  if (!demoMedicalWorkflowId) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'DEMO_MEDICAL_WORKFLOW_ID is not configured' });
    return;
  }

  try {
    const workflow = await WorkflowModel.findById(demoMedicalWorkflowId).lean();
    if (!workflow || workflow.status !== 'published') {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo medical workflow not found or not published' });
      return;
    }

    let collectionId: string | null = null;
    if (workflow.dataset) {
      const ds = await DatasetModel.findById(workflow.dataset).lean();
      if (ds && typeof ds.nildbCollectionId === 'string') {
        collectionId = ds.nildbCollectionId;
      }
    }

    if (!collectionId) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Medical collection is not configured' });
      return;
    }

    const stateKey = await nildbService.storeState(collectionId, {
      data: { symptoms, age },
    }, { encryptAll: true });

    let diagnosis = 'Further evaluation required';
    if (typeof symptoms === 'string') {
      const lower = symptoms.toLowerCase();
      if (lower.includes('fever') && lower.includes('cough')) {
        diagnosis = 'Likely viral infection';
      } else if (lower.includes('chest pain')) {
        diagnosis = 'Cardiac risk – urgent review recommended';
      }
    }

    const workflowId = workflow._id.toString();
    const run = await createRun({
      workflowId,
      payload: {
        source: 'demo-medical',
        stateKey,
        shieldResult: !!shieldResult,
        diagnosis: shieldResult ? undefined : diagnosis,
      },
    });

    if (shieldResult) {
      res.status(HttpStatus.OK).json({
        status: 'running',
        resultShielded: true,
        resultKey: stateKey,
        runId: run.id,
        workflowId,
        collectionId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      status: 'running',
      resultShielded: false,
      diagnosis,
      stateKey,
      runId: run.id,
      workflowId,
      collectionId,
    });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo medical evaluation failed' });
  }
};

export const demoLoanWorkflowHandler = async (_req: Request, res: Response): Promise<void> => {
  const workflow = await getDemoLoanWorkflow();
  if (!workflow) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan workflow not found or not published' });
    return;
  }

  const graph = normalizeGraphPositions(await ensureWorkflowGraph(workflow));
  const nodes = (graph?.nodes ?? []).map((n) => ({
    id: n.id,
    alias: n.alias,
    blockId: n.blockId,
    type: n.type,
    position: n.position,
  }));
  let collectionId: string | null = null;
  let datasetId: string | null = null;
  if (workflow.dataset) {
    const ds = await DatasetModel.findById(workflow.dataset).lean();
    if (ds && typeof ds.nildbCollectionId === 'string') {
      collectionId = ds.nildbCollectionId;
      datasetId = ds._id.toString();
    }
  }

  const builderDid = await nildbService.getBuilderDid();

  res.json({ id: workflow._id.toString(), name: workflow.name, nodes, graph, collectionId, datasetId, builderDid });
};

export const demoMedicalWorkflowHandler = async (_req: Request, res: Response): Promise<void> => {
  const demoMedicalWorkflowId = process.env.DEMO_MEDICAL_WORKFLOW_ID;
  if (!demoMedicalWorkflowId) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'DEMO_MEDICAL_WORKFLOW_ID is not configured' });
    return;
  }

  const workflow = await WorkflowModel.findById(demoMedicalWorkflowId).lean();
  if (!workflow || workflow.status !== 'published') {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo medical workflow not found or not published' });
    return;
  }

  const graph = normalizeGraphPositions(await ensureWorkflowGraph(workflow));
  const nodes = (graph?.nodes ?? []).map((n) => ({
    id: n.id,
    alias: n.alias,
    blockId: n.blockId,
    type: n.type,
    position: n.position,
  }));

  let collectionId: string | null = null;
  let datasetId: string | null = null;
  if (workflow.dataset) {
    const ds = await DatasetModel.findById(workflow.dataset).lean();
    if (ds && typeof ds.nildbCollectionId === 'string') {
      collectionId = ds.nildbCollectionId;
      datasetId = ds._id.toString();
    }
  }

  const builderDid = await nildbService.getBuilderDid();

  res.json({ id: workflow._id.toString(), name: workflow.name, nodes, graph, collectionId, datasetId, builderDid });
};

export const demoDelegationHandler = async (req: Request, res: Response): Promise<void> => {
  const { userDid, collectionId } = req.body ?? {};

  if (!userDid || typeof userDid !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'userDid is required' });
    return;
  }

  if (!collectionId || typeof collectionId !== 'string') {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'collectionId is required' });
    return;
  }

  try {
    const token = await nildbService.generateDelegationToken(userDid, collectionId);
    if (!token) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to generate delegation token' });
      return;
    }

    res.json({ token });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to generate delegation token' });
  }
};

export const demoRunStatusHandler = async (req: Request, res: Response): Promise<void> => {
  const { runId } = req.params;
  if (!runId) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'runId is required' });
    return;
  }

  try {
    const run = await RunModel.findById(runId).lean();
    if (!run) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Run not found' });
      return;
    }

    const result = (run.result ?? {}) as Record<string, unknown>;
    const steps = Array.isArray((result as any).steps) ? ((result as any).steps as unknown[]) : [];
    const completedNodeIds = steps
      .filter((s: any) => s && s.nodeId)
      .map((s: any) => s.nodeId as string);

    res.json({
      runId: (run as any)._id.toString(),
      status: run.status,
      completedNodeIds,
      outputs: (result as any).outputs ?? {},
    });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to fetch run status' });
  }
};