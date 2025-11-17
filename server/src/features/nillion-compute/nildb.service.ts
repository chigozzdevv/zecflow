import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

class NilDBService {
  private builderPromise?: Promise<any>;
  private registeredCollections = new Set<string>();

  private async getBuilder(): Promise<any> {
    if (this.builderPromise) return this.builderPromise;

    if (!envConfig.NILDB_ENABLED) {
      throw new Error('NilDB is not enabled. Set NILDB_ENABLED=true in .env');
    }

    const { NILLION_API_KEY, NILCHAIN_URL, NILAUTH_URL, NILDB_NODES } = envConfig;

    if (!NILLION_API_KEY || !NILCHAIN_URL || !NILAUTH_URL || !NILDB_NODES) {
      throw new Error('NilDB config missing. Set NILLION_API_KEY, NILCHAIN_URL, NILAUTH_URL, NILDB_NODES');
    }

    const apiKey = NILLION_API_KEY!;
    const chainUrl = NILCHAIN_URL!;
    const authUrl = NILAUTH_URL!;
    const dbNodeList = NILDB_NODES!;

    this.builderPromise = (async () => {
      const { SecretVaultBuilderClient } = await import('@nillion/secretvaults');
      const { Keypair } = await import('@nillion/nuc');

      const dbs = dbNodeList.split(',').map((s) => s.trim()).filter(Boolean);
      const keypair = Keypair.from(apiKey);

      const builder = await SecretVaultBuilderClient.from({
        keypair,
        urls: { chain: chainUrl, auth: authUrl, dbs },
        blindfold: { operation: 'store' },
      });

      await builder.refreshRootToken();

      try {
        const existingProfile = await builder.readProfile();
        logger.info({ name: existingProfile.data.name }, 'NilDB builder already registered');
      } catch (profileError) {
        try {
          await builder.register({
            did: keypair.toDid() as any,
            name: 'ZecFlow Builder',
          });
          logger.info('NilDB builder registered successfully');
        } catch (registerError: any) {
          if (registerError.message.includes('duplicate key')) {
            logger.info('NilDB builder already registered');
          } else {
            throw registerError;
          }
        }
      }

      logger.info('NilDB SecretVaults builder initialized');
      return builder;
    })();

    return this.builderPromise;
  }

  async ensureCollection(collectionId: string, schema: Record<string, unknown>): Promise<void> {
    if (this.registeredCollections.has(collectionId)) return;

    const builder = await this.getBuilder();

    try {
      const collections = await builder.readCollections();
      const exists = collections?.data?.some((c: any) => c._id === collectionId);

      if (!exists) {
        const collection = {
          _id: collectionId,
          type: 'standard',
          name: `Collection ${collectionId}`,
          schema,
        };

        await builder.createCollection(collection);
        logger.info({ collectionId }, 'NilDB collection created');
      }

      this.registeredCollections.add(collectionId);
    } catch (error) {
      logger.error({ err: error, collectionId }, 'Failed to ensure collection');
      throw error;
    }
  }

  async putDocument(
    collectionId: string,
    key: string,
    data: Record<string, unknown>,
    schema?: Record<string, unknown>,
  ): Promise<{ key: string; collectionId: string }> {
    const builder = await this.getBuilder();

    if (schema) {
      await this.ensureCollection(collectionId, schema);
    }

    const record = { _id: key, ...data };

    try {
      const existing = await builder.findData({ collection: collectionId, filter: { _id: key } });

      if (existing?.data?.length) {
        await builder.updateData({
          collection: collectionId,
          filter: { _id: key },
          update: { $set: data },
        });
        logger.info({ collectionId, key }, 'NilDB document updated');
      } else {
        await builder.createStandardData({ collection: collectionId, data: [record] });
        logger.info({ collectionId, key }, 'NilDB document created');
      }

      return { key, collectionId };
    } catch (error) {
      logger.error({ err: error, collectionId, key }, 'NilDB putDocument failed');
      throw error;
    }
  }

  async getDocument<T = unknown>(collectionId: string, key: string): Promise<T | null> {
    const builder = await this.getBuilder();

    try {
      const res = await builder.findData({ collection: collectionId, filter: { _id: key } });
      const item = res?.data?.[0];
      return item ? (item as T) : null;
    } catch (error) {
      logger.error({ err: error, collectionId, key }, 'NilDB getDocument failed');
      throw error;
    }
  }

  async deleteDocument(collectionId: string, key: string): Promise<void> {
    const builder = await this.getBuilder();

    try {
      await builder.deleteData({ collection: collectionId, filter: { _id: key } });
      logger.info({ collectionId, key }, 'NilDB document deleted');
    } catch (error) {
      logger.error({ err: error, collectionId, key }, 'NilDB deleteDocument failed');
      throw error;
    }
  }

  async storeState(collectionId: string, payload: Record<string, unknown>): Promise<string> {
    const key = typeof payload.key === 'string' && payload.key.length ? payload.key : 'default';
    const payloadData = payload.data as Record<string, unknown> | undefined;
    const data = payloadData ?? payload;
    const compositeKey = `${collectionId}:${key}`;

    await this.putDocument(collectionId, compositeKey, data);
    return compositeKey;
  }

  async readState(collectionId: string, key?: string): Promise<unknown> {
    const compositeKey = `${collectionId}:${key ?? 'default'}`;
    return this.getDocument(collectionId, compositeKey);
  }
}

export const nildbService = new NilDBService();
