import { Router } from 'express';
import authRouter from '@/features/auth/auth.route';
import usersRouter from '@/features/users/users.route';
import organizationsRouter from '@/features/organizations/organizations.route';
import connectorsRouter from '@/features/connectors/connectors.route';
import triggersRouter from '@/features/triggers/triggers.route';
import blocksRouter from '@/features/blocks/blocks.route';
import actionsRouter from '@/features/actions/actions.route';
import workflowsRouter from '@/features/workflows/workflows.route';
import runsRouter from '@/features/runs/runs.route';
import agentsRouter from '@/features/agents/agents.route';
import nillionRouter from '@/features/nillion-compute/nillion-compute.route';
import zcashRouter from '@/features/zcash-execution/zcash-execution.route';
import notificationsRouter from '@/features/notifications/notifications.route';
import auditRouter from '@/features/audit/audit.route';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/organizations', organizationsRouter);
router.use('/connectors', connectorsRouter);
router.use('/triggers', triggersRouter);
router.use('/blocks', blocksRouter);
router.use('/actions', actionsRouter);
router.use('/workflows', workflowsRouter);
router.use('/runs', runsRouter);
router.use('/agents', agentsRouter);
router.use('/nillion', nillionRouter);
router.use('/zcash', zcashRouter);
router.use('/notifications', notificationsRouter);
router.use('/audit', auditRouter);

export default router;
