import IORedis from 'ioredis';
import { envConfig } from './env';

const redisUrl = envConfig.QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6379';

let redisInstance: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(redisUrl, {
      // Keep consistent with BullMQ requirements when sharing connections
      maxRetriesPerRequest: null,
    });
  }
  return redisInstance;
}
