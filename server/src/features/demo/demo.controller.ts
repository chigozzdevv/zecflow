import { Request, Response } from 'express';
import { HttpStatus } from '@/utils/http-status';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { DemoSubmissionModel } from './demo.model';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { nilaiService } from '@/features/nillion-compute/nilai.service';
import { DatasetModel } from '@/features/datasets/datasets.model';
import { buildGraphFromBlocks } from '@/features/workflows/workflows.service';
import type { WorkflowGraph } from '@/features/workflows/workflows.types';

import { logger } from '@/utils/logger';

const unwrapNilDbValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const allot = record['%allot'];
    if (typeof allot === 'string') {
      return allot;
    }
    if (allot && typeof allot === 'object') {
      try {
        return JSON.stringify(allot);
      } catch {
        /* ignore */
      }
    }
    const nestedKeys = ['message', 'result', 'value', 'payload'];
    for (const key of nestedKeys) {
      if (record[key] !== undefined) {
        const nested = unwrapNilDbValue(record[key]);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return undefined;
};

const extractDiagnosisFromRecord = (record: Record<string, unknown> | null): string | undefined => {
  if (!record) {
    return undefined;
  }
  const rootResult = record['result'] as Record<string, unknown> | undefined;
  const raw = record['raw'] as Record<string, unknown> | undefined;
  const rawResult = raw?.['result'] as Record<string, unknown> | undefined;

  const candidates = [
    record['message'],
    rootResult?.['message'],
    record['result'],
    rawResult?.['message'],
    raw?.['message'],
  ];

  for (const candidate of candidates) {
    const value = unwrapNilDbValue(candidate);
    if (value) {
      return value.trim();
    }
  }
  return undefined;
};

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

const MIN_SPREAD_PX = 140;

const normalizeGraphPositions = (graph: WorkflowGraph | null): WorkflowGraph | null => {
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
    let schema: Record<string, unknown> | undefined;
    if (workflow.dataset) {
      const ds = await DatasetModel.findById(workflow.dataset).lean();
      if (ds && typeof ds.nildbCollectionId === 'string') {
        collectionId = ds.nildbCollectionId;
        schema = ds.schema;
      }
    }

    if (!collectionId) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Medical collection is not configured' });
      return;
    }

    const numericAge = Number(age);
    if (typeof symptoms !== 'string' || !symptoms.trim() || Number.isNaN(numericAge)) {
      res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid payload' });
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
          symptoms: symptoms.trim(),
          age: numericAge,
          source: 'demo-medical',
        },
        schema,
        { encryptAll: true },
      );
      stateKey = `${collectionId}:${docKey}`;
    } catch (err) {
      logger.error({ err }, 'Failed to store medical payload');
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to store encrypted medical data' });
      return;
    }

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

export const demoMedicalResultFetchHandler = async (req: Request, res: Response): Promise<void> => {
  const resultKey = typeof req.query.resultKey === 'string' ? req.query.resultKey : null;
  if (!resultKey) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'resultKey is required' });
    return;
  }

  const separatorIndex = resultKey.indexOf(':');
  if (separatorIndex === -1) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid resultKey format' });
    return;
  }

  const collectionId = resultKey.slice(0, separatorIndex);
  const key = resultKey.slice(separatorIndex + 1);
  if (!collectionId || !key) {
    res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid resultKey format' });
    return;
  }

  try {
    const record = await nildbService.getDocument<Record<string, any>>(collectionId, key);
    if (!record) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Result not found' });
      return;
    }

    const signatureValue = unwrapNilDbValue((record as any).signature);

    const attestation = await nilaiService.getAttestationSummary();
    const signature = signatureValue ?? null;
    const attestationVerifyingKey = attestation?.['verifying_key'];
    const verifyingKey = typeof attestationVerifyingKey === 'string' ? attestationVerifyingKey : null;

    const diagnosis = extractDiagnosisFromRecord(record as Record<string, unknown>);

    res.json({
      attestation: attestation ?? null,
      signature,
      verifyingKey: typeof verifyingKey === 'string' ? verifyingKey : null,
      key: `${collectionId}:${key}`,
      diagnosis: diagnosis ?? null,
    });
  } catch (err) {
    logger.error({ err, resultKey }, 'Failed to fetch medical result record');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to fetch medical result' });
  }
};

export const demoMedicalAttestationHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const report = await nilaiService.getAttestationReport();
    if (!report) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: 'NilAI attestation unavailable' });
      return;
    }
    res.json(report);
  } catch (err) {
    logger.error({ err }, 'Failed to retrieve NilAI attestation report');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Unable to fetch attestation report' });
  }
};

export const demoRunsHandler = async (req: Request, res: Response): Promise<void> => {
  const loanWorkflowId = process.env.DEMO_LOAN_WORKFLOW_ID;
  const medicalWorkflowId = process.env.DEMO_MEDICAL_WORKFLOW_ID;
  const demoWorkflowIds = [loanWorkflowId, medicalWorkflowId].filter((id): id is string => Boolean(id));

  const requestedWorkflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : null;
  const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? Math.floor(limitParam) : 40;

  if (!demoWorkflowIds.length) {
    res.json({ runs: [] });
    return;
  }

  let targetWorkflowIds: string[] = demoWorkflowIds;
  if (requestedWorkflowId) {
    if (!demoWorkflowIds.includes(requestedWorkflowId)) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Workflow not available for demo runs' });
      return;
    }
    targetWorkflowIds = [requestedWorkflowId];
  }

  try {
    const runs = await RunModel.find({ workflow: { $in: targetWorkflowIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!runs.length) {
      res.json({ runs: [] });
      return;
    }

    const workflowDocs = await WorkflowModel.find({ _id: { $in: targetWorkflowIds } })
      .select('_id name')
      .lean();
    const workflowNames = new Map(workflowDocs.map((w) => [w._id.toString(), w.name]));

    const payloadRuns = runs.map((run) => {
      const payload = (run.payload ?? {}) as Record<string, unknown>;
      const outputs = (run.result as Record<string, unknown> | undefined)?.outputs as Record<string, unknown> | undefined;
      const workflowId = run.workflow?.toString?.() ?? '';
      const createdAt = (run as { createdAt?: Date }).createdAt;

      const resultKey =
        typeof outputs?.resultKey === 'string'
          ? (outputs.resultKey as string)
          : typeof payload.resultKey === 'string'
            ? (payload.resultKey as string)
            : null;

      return {
        id: run._id?.toString?.() ?? '',
        workflowId,
        workflowName: workflowNames.get(workflowId) ?? 'Demo workflow',
        status: run.status,
        createdAt: createdAt?.toISOString() ?? null,
        stateKey: typeof payload.stateKey === 'string' ? (payload.stateKey as string) : null,
        resultKey,
        shielded: Boolean(payload.shieldResult ?? outputs?.resultShielded),
      };
    });

    res.json({ runs: payloadRuns });
  } catch (err) {
    logger.error({ err }, 'Failed to load demo runs');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to load demo runs' });
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