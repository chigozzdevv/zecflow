import { Router } from 'express';
import authRouter from '@/features/auth/auth.route';
import organizationsRouter from '@/features/organizations/organizations.route';
import connectorsRouter from '@/features/connectors/connectors.route';
import triggersRouter from '@/features/triggers/triggers.route';
import blocksRouter from '@/features/blocks/blocks.route';
import workflowsRouter from '@/features/workflows/workflows.route';
import runsRouter from '@/features/runs/runs.route';
import nillionRouter from '@/features/nillion-compute/nillion-compute.route';
import zcashRouter from '@/features/zcash-execution/zcash-execution.route';
import billingRouter from '@/features/billing/billing.route';

const router = Router();

router.use('/auth', authRouter);
router.use('/organizations', organizationsRouter);
router.use('/connectors', connectorsRouter);
router.use('/triggers', triggersRouter);
router.use('/blocks', blocksRouter);
router.use('/workflows', workflowsRouter);
router.use('/runs', runsRouter);
router.use('/nillion', nillionRouter);
router.use('/zcash', zcashRouter);
router.use('/billing', billingRouter);

export default router;
