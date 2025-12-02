import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

class NilDBService {
  private builderPromise?: Promise<any>;
  private plaintextBuilderPromise?: Promise<any>;
  private registeredCollections = new Set<string>();
  private cachedBuilderDid?: string;

  async getBuilderDid(): Promise<string | null> {
    if (this.cachedBuilderDid) return this.cachedBuilderDid;

    try {
      const { Signer } = await import('@nillion/nuc');
      const apiKey = envConfig.NILLION_API_KEY;
      if (!apiKey) return null;
      
      const signer = await Signer.fromPrivateKey(apiKey, 'nil');
      const did = await signer.getDid();
      this.cachedBuilderDid = did.didString;
      logger.info({ builderDid: this.cachedBuilderDid }, 'NilDB Builder DID determined');
      return this.cachedBuilderDid;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get builder DID');
      return null;
    }
  }

  async generateDelegationToken(userDid: string, collectionId: string): Promise<string | null> {
    try {
      const { Builder, Did, Signer } = await import('@nillion/nuc');
      const apiKey = envConfig.NILLION_API_KEY;
      if (!apiKey) return null;
      
      const signer = await Signer.fromPrivateKey(apiKey, 'nil');
      const userDidObj = Did.parse(userDid);
      const builderDid = await signer.getDid();
      
      const delegationToken = await Builder.delegation()
        .audience(userDidObj)
        .subject(builderDid)
        .command('/nil/db')
        .signAndSerialize(signer);
      
      return delegationToken;
    } catch (error) {
      logger.error({ err: error, userDid, collectionId }, 'Failed to generate delegation token');
      return null;
    }
  }

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
      const { NilauthClient, PayerBuilder, Signer } = await import('@nillion/nuc');
      const dns = await import('dns');

      const dbs = dbNodeList.split(',').map((s) => s.trim()).filter(Boolean);

      await Promise.all(
        dbs.map((url) => {
          const hostname = new URL(url).hostname;
          return new Promise<void>((resolve) => {
            dns.resolve4(hostname, () => resolve());
          });
        })
      );
      logger.info('DNS pre-warmed for NilDB nodes');

      const payer = await PayerBuilder.fromPrivateKey(apiKey).chainUrl(chainUrl).build();
      const nilauthClient = await NilauthClient.create({ baseUrl: authUrl, payer });
      const signer = await Signer.fromPrivateKey(apiKey, 'nil');

      const builder = await SecretVaultBuilderClient.from({
        signer,
        nilauthClient,
        dbs,
        blindfold: { operation: 'store', useClusterKey: true },
      });

      await builder.refreshRootToken();

      try {
        const existingProfile = await builder.readProfile();
        logger.info({ name: existingProfile.data.name }, 'NilDB builder already registered');
      } catch {
        try {
          const did = await builder.getDid();
          await builder.register({
            did: did.didString,
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
    })().catch((err) => {
      this.builderPromise = undefined;
      throw err;
    });

    return this.builderPromise;
  }

  private async getRawBuilder(): Promise<any> {
    if (this.plaintextBuilderPromise) return this.plaintextBuilderPromise;

    const { NILLION_API_KEY, NILCHAIN_URL, NILAUTH_URL, NILDB_NODES } = envConfig;
    if (!NILLION_API_KEY) throw new Error('NILLION_API_KEY not configured');

    this.plaintextBuilderPromise = (async () => {
      const { SecretVaultBuilderClient } = await import('@nillion/secretvaults');
      const { NilauthClient, PayerBuilder, Signer } = await import('@nillion/nuc');

      const dbs = NILDB_NODES.split(',').map((s) => s.trim()).filter(Boolean);
      const payer = await PayerBuilder.fromPrivateKey(NILLION_API_KEY).chainUrl(NILCHAIN_URL).build();
      const nilauthClient = await NilauthClient.create({ baseUrl: NILAUTH_URL, payer });
      const signer = await Signer.fromPrivateKey(NILLION_API_KEY, 'nil');

      const builder = await SecretVaultBuilderClient.from({
        signer,
        nilauthClient,
        dbs,
      });

      await builder.refreshRootToken();
      logger.info('NilDB raw builder initialized');
      return builder;
    })().catch((err) => {
      this.plaintextBuilderPromise = undefined;
      throw err;
    });

    return this.plaintextBuilderPromise;
  }

  async ensureCollection(collectionId: string, schema: Record<string, unknown>): Promise<void> {
    if (this.registeredCollections.has(collectionId)) return;

    const builder = await this.getBuilder();

    try {
      const collections = await builder.readCollections();
      const exists = collections?.data?.some((c: any) => c.id === collectionId);

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
    options?: { encryptFields?: string[]; encryptAll?: boolean },
  ): Promise<{ key: string; collectionId: string }> {
    const builder = await this.getBuilder();

    if (schema) {
      await this.ensureCollection(collectionId, schema);
    }

    const encryptedData = this.prepareEncryptedData(data, options);
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
    options?: { encryptFields?: string[]; encryptAll?: boolean },
  ): Record<string, unknown> {
    const encryptFields = options?.encryptFields;
    const encryptAll = options?.encryptAll;

    if (encryptFields && encryptFields.length > 0) {
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

    if (encryptAll === false) {
      return data;
    }

    return this.encryptAllSensitiveFields(data);
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
    options?: { encryptFields?: string[]; encryptAll?: boolean },
  ): Promise<string> {
    const key = typeof payload.key === 'string' && payload.key.length ? payload.key : 'default';
    const payloadData = payload.data as Record<string, unknown> | undefined;
    const data = payloadData ?? payload;
    const compositeKey = `${collectionId}:${key}`;

    await this.putDocument(collectionId, compositeKey, data, undefined, options);
    return compositeKey;
  }

  async storeEncryptedShares(
    collectionId: string,
    key: string,
    shares: unknown[],
    retries = 3,
  ): Promise<string> {
    const compositeKey = `${collectionId}:${key}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this._storeEncryptedSharesInternal(collectionId, key, shares, compositeKey);
      } catch (error: any) {
        const isNetworkError = error.message?.includes('fetch failed') || 
                               error.message?.includes('timeout') ||
                               error.message?.includes('ECONNREFUSED');
        
        if (isNetworkError && attempt < retries) {
          logger.warn({ attempt, retries, err: error.message }, 'NilDB network error, retrying...');
          this.builderPromise = undefined;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error('storeEncryptedShares failed after retries');
  }

  private async _storeEncryptedSharesInternal(
    collectionId: string,
    key: string,
    shares: unknown[],
    compositeKey: string,
  ): Promise<string> {
    const builder = await this.getRawBuilder();
    const nodes = builder.nodes as any[];
    
    if (shares.length !== nodes.length) {
      throw new Error(`Share count (${shares.length}) does not match node count (${nodes.length})`);
    }
    
    const firstShare = shares[0] as Record<string, unknown>;
    logger.info({ collectionId, shareFields: Object.keys(firstShare) }, 'Storing encrypted shares');
    
    const results = await Promise.all(
      nodes.map(async (node, index) => {
        const share = shares[index] as Record<string, unknown>;
        const record: Record<string, unknown> = { _id: key, ...share };
        const payload = { collection: collectionId, data: [record] };
        
        const token = await (builder as any).getInvocationFor({
          audience: node.id,
          command: '/nil/db/data/create',
        });
        
        try {
          return await node.createStandardData(token, payload);
        } catch (err: any) {
          logger.error({ nodeIndex: index, nodeId: node.id?.didString, cause: err?.cause }, 'Node store failed');
          throw err;
        }
      }),
    );

    logger.info({ collectionId, key, shareCount: shares.length, results }, 'NilDB encrypted shares stored');
    return compositeKey;
  }

  async readState(collectionId: string, key?: string): Promise<unknown> {
    const compositeKey = `${collectionId}:${key ?? 'default'}`;
    return this.getDocument(collectionId, compositeKey);
  }
}

export const nildbService = new NilDBService();
