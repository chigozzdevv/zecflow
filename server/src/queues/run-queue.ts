import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { envConfig } from '@/config/env';
import { workflowEngine } from '@/features/workflows/workflows.engine';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { RunModel } from '@/features/runs/runs.model';
import { logger } from '@/utils/logger';

const redisUrl = envConfig.QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl);

export const RUN_QUEUE_NAME = 'workflow-runs';

export const runQueue = new Queue(RUN_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const queueEvents = new QueueEvents(RUN_QUEUE_NAME, { connection });
queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, failedReason }, 'Run job failed');
});
queueEvents.on('completed', ({ jobId }) => {
  logger.info({ jobId }, 'Run job completed');
});

export const enqueueRunJob = async (runId: string, options: JobsOptions = {}): Promise<void> => {
  await runQueue.add('execute', { runId }, options);
};

export const startRunWorker = (): void => {
  const worker = new Worker(
    RUN_QUEUE_NAME,
    async (job) => {
      const runId = job.data.runId as string;
      const run = await RunModel.findById(runId);
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      const workflow = await WorkflowModel.findById(run.workflow);
      if (!workflow) {
        throw new Error(`Workflow for run ${runId} not found`);
      }

      if (!workflow.graph || !workflow.graph.nodes || workflow.graph.nodes.length === 0) {
        throw new Error(`Workflow ${workflow._id} has no graph. Please recreate it in the visual editor.`);
      }

      logger.info({ runId, workflowId: workflow._id }, 'Executing workflow graph');
      await workflowEngine.start(runId);
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Run worker failure');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Run worker completed');
  });
};
