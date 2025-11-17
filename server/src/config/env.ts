import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REFRESH_TOKEN_SECRET: z.string().min(1),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  NILCC_API_KEY: z.string().optional(),
  NILCC_BASE_URL: z.string().url().default('https://api.nilcc.nillion.network'),

  NILDB_ENABLED: z.coerce.boolean().default(true),
  NILLION_API_KEY: z.string().optional(),
  NILCHAIN_URL: z.string().url().optional(),
  NILAUTH_URL: z.string().url().optional(),
  NILDB_NODES: z.string().optional(),

  NILAI_API_KEY: z.string().optional(),
  NILAI_BASE_URL: z.string().url().optional(),

  ZCASH_RPC_URL: z.string().url(),
  ZCASH_RPC_USER: z.string().optional(),
  ZCASH_RPC_PASSWORD: z.string().optional(),
  QUEUE_REDIS_URL: z.string().url().optional(),
  PUBLIC_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().min(16),
});

export const envConfig = envSchema.parse(process.env);
