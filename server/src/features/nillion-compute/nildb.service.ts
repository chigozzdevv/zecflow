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
        .command('/nil/db/data/read')
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

    const createBuilder = async () => {
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
    };

    const withRetry = async () => {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await createBuilder();
        } catch (err: any) {
          const isNetworkError = err?.message?.includes('fetch failed') || err?.message?.includes('timeout') || err?.message?.includes('ECONNREFUSED');
          if (!isNetworkError || attempt === maxAttempts) {
            throw err;
          }
          logger.warn({ attempt, maxAttempts, err: err.message }, 'NilDB builder init failed, retrying...');
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      throw new Error('Unable to initialize NilDB builder');
    };

    this.builderPromise = withRetry().catch((err) => {
      this.builderPromise = undefined;
      throw err;
    });

    return this.builderPromise;
  }

  private async getRawBuilder(): Promise<any> {
    if (this.plaintextBuilderPromise) return this.plaintextBuilderPromise;

    const { NILLION_API_KEY, NILCHAIN_URL, NILAUTH_URL, NILDB_NODES } = envConfig;
    if (!NILLION_API_KEY) throw new Error('NILLION_API_KEY not configured');

    const createRawBuilder = async () => {
      const { SecretVaultBuilderClient } = await import('@nillion/secretvaults');
      const { NilauthClient, PayerBuilder, Signer } = await import('@nillion/nuc');
      const dns = await import('dns');

      const dbs = NILDB_NODES.split(',').map((s) => s.trim()).filter(Boolean);

      await Promise.all(
        dbs.map((url) => {
          const hostname = new URL(url).hostname;
          return new Promise<void>((resolve) => {
            dns.resolve4(hostname, () => resolve());
          });
        })
      );

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
    };

    const withRetry = async () => {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await createRawBuilder();
        } catch (err: any) {
          const isNetworkError = err?.message?.includes('fetch failed') || err?.message?.includes('timeout') || err?.message?.includes('ECONNREFUSED');
          if (!isNetworkError || attempt === maxAttempts) {
            throw err;
          }
          logger.warn({ attempt, maxAttempts, err: err.message }, 'NilDB raw builder init failed, retrying...');
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      throw new Error('Unable to initialize NilDB raw builder');
    };

    this.plaintextBuilderPromise = withRetry().catch((err) => {
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

  async createCollectionWithSchema(
    collectionId: string,
    name: string,
    schema: Record<string, unknown>,
  ): Promise<boolean> {
    const builder = await this.getBuilder();

    try {
      const collections = await builder.readCollections();
      const exists = collections?.data?.some((c: any) => c.id === collectionId || c._id === collectionId);

      if (exists) {
        logger.info({ collectionId }, 'Collection already exists, cannot recreate');
        return false;
      }

      const collection = {
        _id: collectionId,
        type: 'standard',
        name,
        schema,
      };

      logger.info({ collectionId, schema: JSON.stringify(schema, null, 2) }, 'Creating collection with schema');
      await builder.createCollection(collection);
      logger.info({ collectionId }, 'NilDB collection created with schema');
      return true;
    } catch (error) {
      logger.error({ err: error, collectionId }, 'Failed to create collection with schema');
      throw error;
    }
  }

  async getCollectionSchema(collectionId: string): Promise<Record<string, unknown> | null> {
    try {
      const builder = await this.getBuilder();
      const collections = await builder.readCollections();
      const collection = collections?.data?.find((c: any) => c.id === collectionId || c._id === collectionId);
      if (collection) {
        logger.info({
          collectionId,
          collectionData: JSON.stringify(collection, null, 2),
        }, 'NilDB collection schema retrieved');
        return collection.schema ?? collection;
      }
      return null;
    } catch (error) {
      logger.error({ err: error, collectionId }, 'Failed to get collection schema');
      return null;
    }
  }

  private sanitizeComplexFields(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = { ...data };

    const flattenSubset = (
      target: Record<string, unknown>,
      prefix: string,
      source: Record<string, unknown>,
      keys: string[],
    ) => {
      for (const key of keys) {
        const value = source[key];
        if (value === undefined || value === null) {
          continue;
        }
        const safeKey = `${prefix}_${key}`;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          target[safeKey] = value;
        } else {
          target[safeKey] = JSON.stringify(value);
        }
      }
    };

    if (sanitized.result && typeof sanitized.result === 'object' && !Array.isArray(sanitized.result)) {
      const resultObj = sanitized.result as Record<string, unknown>;
      if (typeof sanitized.message !== 'string' && typeof resultObj.message === 'string') {
        sanitized.message = resultObj.message;
      }
      if (typeof sanitized.signature !== 'string' && typeof resultObj.signature === 'string') {
        sanitized.signature = resultObj.signature;
      }
      flattenSubset(sanitized, 'result', resultObj, ['model', 'finish_reason']);
      sanitized.result = undefined;
      delete sanitized.result;
    }

    if (sanitized.raw && typeof sanitized.raw === 'object' && !Array.isArray(sanitized.raw)) {
      const rawObj = sanitized.raw as Record<string, unknown>;
      flattenSubset(sanitized, 'raw', rawObj, ['id', 'model', 'finish_reason', 'service_tier']);
      if (rawObj.created !== undefined) {
        sanitized.raw_created = rawObj.created;
      }
      if (rawObj.signed !== undefined) {
        sanitized.raw_signed = rawObj.signed;
      }
      const usage = rawObj.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage === 'object') {
        const usageKeys = ['total_tokens', 'prompt_tokens', 'completion_tokens'];
        for (const key of usageKeys) {
          if (usage[key] !== undefined) {
            sanitized[`raw_usage_${key}`] = usage[key];
          }
        }
      }
      sanitized.raw = undefined;
      delete sanitized.raw;
    }

    if (sanitized.attestation && typeof sanitized.attestation === 'object' && !Array.isArray(sanitized.attestation)) {
      const attObj = sanitized.attestation as Record<string, unknown>;
      flattenSubset(sanitized, 'attestation', attObj, [
        'nonce',
        'verifying_key',
        'cpu_attestation_hash',
        'cpu_attestation_preview',
        'gpu_attestation_hash',
        'gpu_attestation_preview',
        'report_source',
        'report_origin',
      ]);
      if (attObj.has_full_report !== undefined) {
        sanitized.attestation_has_full_report = attObj.has_full_report;
      }
      sanitized.attestation = undefined;
      delete sanitized.attestation;
    }

    return sanitized;
  }

  async putDocument(
    collectionId: string,
    key: string,
    data: Record<string, unknown>,
    schema?: Record<string, unknown>,
    options?: { encryptFields?: string[]; encryptAll?: boolean },
  ): Promise<{ key: string; collectionId: string }> {
    const normalizedData = this.sanitizeComplexFields(data);
    const builder = await this.getBuilder();

    logger.info({
      collectionId,
      key,
      inputData: JSON.stringify(normalizedData, null, 2),
      options,
    }, 'NilDB putDocument called - INPUT DATA');

    await this.getCollectionSchema(collectionId);

    if (schema) {
      await this.ensureCollection(collectionId, schema);
    }

    const encryptedData = this.prepareEncryptedData(normalizedData, options);
    const record = { _id: key, ...encryptedData };

    logger.info({
      collectionId,
      key,
      encryptedData: JSON.stringify(encryptedData, null, 2),
      finalRecord: JSON.stringify(record, null, 2),
    }, 'NilDB putDocument - ENCRYPTED DATA & FINAL RECORD');

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
        logger.info({
          collectionId,
          payloadToCreate: JSON.stringify({ collection: collectionId, data: [record] }, null, 2),
        }, 'NilDB createStandardData - PAYLOAD BEING SENT');
        await builder.createStandardData({ collection: collectionId, data: [record] });
        logger.info({ collectionId, key }, 'NilDB document created');
      }

      return { key, collectionId };
    } catch (error) {
      logger.error({ err: error, collectionId, key }, 'NilDB putDocument failed');
      throw error;
    }
  }

  async putDocumentRaw(
    collectionId: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<{ key: string; collectionId: string }> {
    const builder = await this.getRawBuilder();
    const record = { _id: key, ...data };

    logger.info({
      collectionId,
      key,
      data: JSON.stringify(data, null, 2),
      record: JSON.stringify(record, null, 2),
    }, 'NilDB putDocumentRaw - STORING WITHOUT ENCRYPTION');

    try {
      const existing = await builder.findData({ collection: collectionId, filter: { _id: key } });

      if (existing?.data?.length) {
        await builder.updateData({
          collection: collectionId,
          filter: { _id: key },
          update: { $set: data },
        });
        logger.info({ collectionId, key }, 'NilDB document updated (raw)');
      } else {
        await builder.createStandardData({ collection: collectionId, data: [record] });
        logger.info({ collectionId, key }, 'NilDB document created (raw)');
      }

      return { key, collectionId };
    } catch (error) {
      logger.error({ err: error, collectionId, key }, 'NilDB putDocumentRaw failed');
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
      if (value === undefined) {
        continue;
      }

      if (plaintextFields.includes(key)) {
        result[key] = value;
        continue;
      }

      if (value === null) {
        result[key] = { '%allot': 'null' };
        continue;
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          result[key] = { '%allot': JSON.stringify(value) };
          continue;
        }

        const objValue = value as Record<string, unknown>;
        const keys = Object.keys(objValue);
        if (keys.length === 1 && keys[0] === '%allot') {
          result[key] = value;
        } else {
          result[key] = { '%allot': JSON.stringify(objValue) };
        }
        continue;
      }

      if (typeof value === 'string') {
        result[key] = { '%allot': value };
      } else {
        result[key] = { '%allot': JSON.stringify(value) };
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
    let key = typeof payload.key === 'string' && payload.key.length ? payload.key : undefined;
    
    if (!key) {
      const { v4: uuidv4 } = await import('uuid');
      key = uuidv4();
    }
    
    const payloadData = payload.data as Record<string, unknown> | undefined;
    const data = payloadData ?? payload;
    await this.putDocument(collectionId, key, data, undefined, options);
    return `${collectionId}:${key}`;
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
        const record: Record<string, unknown> = { _id: key };
        for (const [field, value] of Object.entries(share)) {
          record[field] = { '%share': value };
        }
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
