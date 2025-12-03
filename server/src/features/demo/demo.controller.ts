import { Request, Response } from 'express';
import { HttpStatus } from '@/utils/http-status';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { DemoSubmissionModel } from './demo.model';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { DatasetModel } from '@/features/datasets/datasets.model';

import { logger } from '@/utils/logger';

export const demoLoanResultHandler = async (req: Request, res: Response): Promise<void> => {
  const body = req.body ?? {};
  res.status(HttpStatus.OK).json({ received: true, body });
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

    const workflow = await WorkflowModel.findOne({ status: 'published' }).lean();
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
  const workflow = await WorkflowModel.findOne({ status: 'published' }).lean();
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

  try {
    const stateKey = await nildbService.storeState('demo-medical', {
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

    const demoMedicalWorkflowId = process.env.DEMO_MEDICAL_WORKFLOW_ID;
    if (!demoMedicalWorkflowId) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'DEMO_MEDICAL_WORKFLOW_ID is not configured' });
      return;
    }

    const workflow = await WorkflowModel.findById(demoMedicalWorkflowId);
    if (!workflow || workflow.status !== 'published') {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo medical workflow not found or not published' });
      return;
    }

    await createRun({
      workflowId: workflow.id,
      payload: {
        source: 'demo-medical',
        stateKey,
        shieldResult: !!shieldResult,
        diagnosis: shieldResult ? undefined : diagnosis,
      },
    });

    if (shieldResult) {
      res.status(HttpStatus.OK).json({ status: 'completed', resultShielded: true, resultKey: stateKey });
      return;
    }

    res.status(HttpStatus.OK).json({ status: 'completed', resultShielded: false, diagnosis, stateKey });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo medical evaluation failed' });
  }
};

export const demoLoanWorkflowHandler = async (_req: Request, res: Response): Promise<void> => {
  const workflow = await WorkflowModel.findOne({ status: 'published' }).lean();
  if (!workflow) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan workflow not found or not published' });
    return;
  }

  const nodes = (workflow.graph?.nodes ?? []).map((n) => ({
    id: n.id,
    alias: n.alias,
    blockId: n.blockId,
    type: n.type,
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

  res.json({ id: workflow._id.toString(), name: workflow.name, nodes, collectionId, datasetId, builderDid });
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

  const nodes = (workflow.graph?.nodes ?? []).map((n) => ({
    id: n.id,
    alias: n.alias,
    blockId: n.blockId,
    type: n.type,
  }));

  res.json({ id: workflow._id.toString(), name: workflow.name, nodes });
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