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
  NILCC_POLL_TIMEOUT_MS: z.coerce.number().optional(),
  NILCC_POLL_INTERVAL_MS: z.coerce.number().optional(),

  NILDB_ENABLED: z.coerce.boolean().default(true),
  NILLION_API_KEY: z.string().optional(),
  NILCHAIN_URL: z.string().url().default('http://rpc.testnet.nilchain-rpc-proxy.nilogy.xyz'),
  NILAUTH_URL: z.string().url().default('https://nilauth.sandbox.app-cluster.sandbox.nilogy.xyz'),
  NILDB_NODES: z.string().default('https://nildb-stg-n1.nillion.network,https://nildb-stg-n2.nillion.network,https://nildb-stg-n3.nillion.network'),

  NILAI_API_KEY: z.string().optional(),
  NILAI_BASE_URL: z.string().url().default('https://nilai-a779.nillion.network/v1'),
  NILAI_NILAUTH_INSTANCE: z.enum(['sandbox', 'production']).default('sandbox'),

  ZCASH_RPC_URL: z.string().url(),
  ZCASH_RPC_USER: z.string().optional(),
  ZCASH_RPC_PASSWORD: z.string().optional(),
  ZCASH_DEFAULT_FROM_ADDRESS: z.string().optional(),
  ZCASH_DEFAULT_PRIVACY_POLICY: z
    .enum([
      'FullPrivacy',
      'LegacyCompat',
      'AllowRevealedAmounts',
      'AllowRevealedRecipients',
      'AllowRevealedSenders',
      'AllowFullyTransparent',
      'AllowLinkingAccountAddresses',
      'NoPrivacy',
    ])
    .optional(),
  ZCASH_OPERATION_TIMEOUT_MS: z.coerce.number().default(120_000),
  QUEUE_REDIS_URL: z.string().url().optional(),
  PUBLIC_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().min(16),
  CORS_ORIGINS: z.string().optional(),
});

export const envConfig = envSchema.parse(process.env);
