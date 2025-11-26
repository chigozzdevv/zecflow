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

    if (!NILLION_API_KEY) {
      throw new Error('NilDB config missing. Set NILLION_API_KEY');
    }

    const apiKey = NILLION_API_KEY;
    const chainUrl = NILCHAIN_URL;
    const authUrl = NILAUTH_URL;
    const dbNodeList = NILDB_NODES;

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
          const did = keypair.toDid();
          await builder.register({
            did: did as any,
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
    options?: { encryptFields?: string[] },
  ): Promise<{ key: string; collectionId: string }> {
    const builder = await this.getBuilder();

    if (schema) {
      await this.ensureCollection(collectionId, schema);
    }

    const encryptedData = this.prepareEncryptedData(data, options?.encryptFields);
    const record = { _id: key, ...encryptedData };

    try {
      const existing = await builder.findData({ collection: collectionId, filter: { _id: key } });

      if (existing?.data?.length) {
        await builder.updateData({
          collection: collectionId,
          filter: { _id: key },
          update: { $set: encryptedData },
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

  private prepareEncryptedData(
    data: Record<string, unknown>,
    encryptFields?: string[],
  ): Record<string, unknown> {
    if (!encryptFields || encryptFields.length === 0) {
      return this.encryptAllSensitiveFields(data);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (encryptFields.includes(key) && value !== null && value !== undefined) {
        result[key] = { '%allot': String(value) };
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private encryptAllSensitiveFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const plaintextFields = ['_id', 'id', 'key', 'type', 'name', 'createdAt', 'updatedAt', 'timestamp'];

    for (const [key, value] of Object.entries(data)) {
      if (plaintextFields.includes(key) || value === null || value === undefined) {
        result[key] = value;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.encryptAllSensitiveFields(value as Record<string, unknown>);
      } else {
        result[key] = { '%allot': typeof value === 'string' ? value : JSON.stringify(value) };
      }
    }
    return result;
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

  async storeState(
    collectionId: string,
    payload: Record<string, unknown>,
    options?: { encryptFields?: string[] },
  ): Promise<string> {
    const key = typeof payload.key === 'string' && payload.key.length ? payload.key : 'default';
    const payloadData = payload.data as Record<string, unknown> | undefined;
    const data = payloadData ?? payload;
    const compositeKey = `${collectionId}:${key}`;

    await this.putDocument(collectionId, compositeKey, data, undefined, options);
    return compositeKey;
  }

  async readState(collectionId: string, key?: string): Promise<unknown> {
    const compositeKey = `${collectionId}:${key ?? 'default'}`;
    return this.getDocument(collectionId, compositeKey);
  }
}

export const nildbService = new NilDBService();
