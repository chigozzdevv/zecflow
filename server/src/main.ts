import 'tsconfig-paths/register';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import app from '@/app';
import { envConfig } from '@/config/env';
import { connectMongo } from '@/config/mongo';
import { logger } from '@/utils/logger';
import { initializeTriggerSchedules } from '@/features/jobs/schedule-runner';
import { startZcashWatcher } from '@/features/zcash-execution/zcash-watcher';
import { startCustomPollRunner } from '@/features/jobs/custom-poll-runner';
import { startTwitterPollRunner } from '@/features/jobs/twitter-poll-runner';
import { startRunWorker } from '@/queues/run-queue';

const server = http.createServer(app);

const start = async (): Promise<void> => {
  try {
    await connectMongo();
    await initializeTriggerSchedules();
    startZcashWatcher();
    startCustomPollRunner();
    startTwitterPollRunner();
    startRunWorker();
    server.listen(envConfig.PORT, () => {
      logger.info(`Server running on port ${envConfig.PORT}`);
    });

    const keepAliveUrl = envConfig.PUBLIC_URL;
    const keepAliveIntervalMs = envConfig.KEEP_ALIVE_INTERVAL_MS ?? 10 * 60 * 1000;
    let keepAliveInterval: NodeJS.Timer | undefined;

    try {
      const parsedUrl = new URL(keepAliveUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const ping = () => {
        const requestStart = Date.now();
        const req = client.get(keepAliveUrl, (res) => {
          res.on('data', () => {});
          res.on('end', () => {
            logger.debug({ status: res.statusCode, elapsedMs: Date.now() - requestStart }, 'Keep-alive ping succeeded');
          });
        });

        req.on('error', (err) => {
          logger.warn({ err }, 'Keep-alive ping failed');
        });
      };

      keepAliveInterval = setInterval(ping, keepAliveIntervalMs);
      ping();
    } catch (error) {
      logger.warn({ err: error }, 'Failed to initialize keep-alive ping');
    }
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
