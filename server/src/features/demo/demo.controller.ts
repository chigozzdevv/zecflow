import { Request, Response } from 'express';
import { HttpStatus } from '@/utils/http-status';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { DemoSubmissionModel } from './demo.model';
import { nildbService } from '@/features/nillion-compute/nildb.service';
import { DatasetModel } from '@/features/datasets/datasets.model';

export const demoLoanHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stateKey } = req.body ?? {};
    if (typeof stateKey !== 'string' || !stateKey.includes(':')) {
      res.status(HttpStatus.BAD_REQUEST).json({ message: 'stateKey is required and must be "collection:document"' });
      return;
    }

    await DemoSubmissionModel.create({ stateKey });

    res.status(HttpStatus.OK).json({
      stateKey,
      status: 'submitted',
    });
  } catch (err) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Demo loan evaluation failed' });
  }
};

export const demoLoanInboxHandler = async (req: Request, res: Response): Promise<void> => {
  const demoLoanWorkflowId = process.env.DEMO_LOAN_WORKFLOW_ID;
  if (!demoLoanWorkflowId) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'DEMO_LOAN_WORKFLOW_ID is not configured' });
    return;
  }

  const workflow = await WorkflowModel.findById(demoLoanWorkflowId);
  if (!workflow || workflow.status !== 'published') {
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
        workflowId: workflow.id,
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
  const demoLoanWorkflowId = process.env.DEMO_LOAN_WORKFLOW_ID;
  if (!demoLoanWorkflowId) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'DEMO_LOAN_WORKFLOW_ID is not configured' });
    return;
  }

  const workflow = await WorkflowModel.findById(demoLoanWorkflowId).lean();
  if (!workflow || workflow.status !== 'published') {
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

  res.json({ id: workflow._id.toString(), name: workflow.name, nodes, collectionId, datasetId });
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

// no demo config; loan demo uses workflow-bound dataset metadata
