import http from 'http';
import app from '@/app';
import { envConfig } from '@/config/env';
import { connectMongo } from '@/config/mongo';
import { logger } from '@/utils/logger';
import { initializeTriggerSchedules } from '@/features/triggers/trigger-runner';
import { startZcashWatcher } from '@/features/zcash-execution/zcash-watcher';
import { startCustomPollRunner } from '@/features/triggers/custom-poll-runner';
import { startRunWorker } from '@/queues/run-queue';

const server = http.createServer(app);

const start = async (): Promise<void> => {
  try {
    await connectMongo();
    await initializeTriggerSchedules();
    startZcashWatcher();
    startCustomPollRunner();
    startRunWorker();
    server.listen(envConfig.PORT, () => {
      logger.info(`Server running on port ${envConfig.PORT}`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

start();

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
});
