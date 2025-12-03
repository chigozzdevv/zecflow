import axios, { AxiosInstance } from 'axios';
import { envConfig } from '@/config/env';
import { logger } from '@/utils/logger';

type CreateWorkloadInput = {
  name: string;
  dockerCompose: string;
  publicContainerName: string;
  publicContainerPort: number;
  cpus: number;
  memory: number;
  disk: number;
  gpus?: number;
  artifactsVersion: string;
  envVars?: Record<string, string>;
  files?: Record<string, string | Buffer>;
  dockerCredentials?: Array<{ server: string; username: string; password: string }>;
};

interface NilCCTier {
  id: string;
  name?: string;
  cpus: number;
  memory: number;
  disk: number;
  gpus: number;
}

class NilCCService {
  private client: AxiosInstance;
  private artifactsVersionCache?: { value: string; expiresAt: number };
  private workloadTierCache?: { tiers: NilCCTier[]; expiresAt: number };
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor() {
    if (!envConfig.NILCC_API_KEY) {
      logger.warn('NILCC_API_KEY not configured - nilCC features will be unavailable');
    }

    this.client = axios.create({
      baseURL: envConfig.NILCC_BASE_URL,
      headers: {
        ...(envConfig.NILCC_API_KEY ? { 'x-api-key': envConfig.NILCC_API_KEY } : {}),
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      timeout: 30000,
    });

    logger.info('NilCC client initialized');
  }

  async listWorkloads(): Promise<any[]> {
    try {
      const { data } = await this.client.post('/api/v1/workloads/list');
      return data?.workloads ?? data ?? [];
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list nilCC workloads');
      throw new Error(`NilCC list workloads failed: ${error.message}`);
    }
  }

  async getWorkload(workloadId: string): Promise<any | null> {
    try {
      const list = await this.listWorkloads();
      return list.find((w: any) => w.id === workloadId || w.workloadId === workloadId) ?? null;
    } catch (error: any) {
      logger.error({ err: error, workloadId }, 'Failed to get nilCC workload');
      throw error;
    }
  }

  extractPublicUrl(workload: any): string | undefined {
    const domain = workload?.publicDomain || workload?.domain || workload?.hostname || workload?.publicUrl;
    if (!domain) return undefined;
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }

  async createWorkload(input: CreateWorkloadInput): Promise<{ id: string; publicUrl?: string }> {
    try {
      const payload = {
        name: input.name,
        dockerCompose: input.dockerCompose,
        publicContainerName: input.publicContainerName,
        publicContainerPort: input.publicContainerPort,
        cpus: input.cpus,
        memory: input.memory,
        disk: input.disk,
        gpus: input.gpus ?? 0,
        artifactsVersion: input.artifactsVersion,
        envVars: input.envVars,
        files: this.prepareFiles(input.files),
        dockerCredentials: input.dockerCredentials,
      };

      await this.ensureTierMatch({
        cpus: payload.cpus,
        memory: payload.memory,
        disk: payload.disk,
        gpus: payload.gpus,
      });

      const { data } = await this.client.post('/api/v1/workloads/create', payload);
      const id = data?.id || data?.workloadId || data?.workload?.id;
      const publicUrl = this.extractPublicUrl(data?.workload) || this.extractPublicUrl(data);

      if (!id) {
        logger.warn({ data }, 'NilCC createWorkload: unexpected response shape');
        throw new Error('Failed to extract workload ID from response');
      }

      logger.info({ workloadId: id, publicUrl }, 'NilCC workload created');
      return { id, publicUrl };
    } catch (error: any) {
      logger.error({ err: error, input: input.name }, 'Failed to create nilCC workload');
      throw new Error(`NilCC create workload failed: ${error.message}`);
    }
  }

  async getLogs(workloadId: string, options?: { tail?: boolean }): Promise<any> {
    try {
      const { data } = await this.client.post('/api/v1/workloads/logs', {
        workloadId,
        tail: options?.tail ?? false,
      });
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch {
          return data;
        }
      }
      return data;
    } catch (error: any) {
      logger.error({ err: error, workloadId }, 'Failed to get nilCC workload logs');
      throw new Error(`NilCC get logs failed: ${error.message}`);
    }
  }

  async getContainerLogs(
    workloadId: string,
    containerName: string,
    options?: { tail?: boolean; stream?: 'stdout' | 'stderr'; maxLines?: number },
  ): Promise<any> {
    try {
      const { data } = await this.client.post('/api/v1/workloads/container-logs', {
        workloadId,
        container: containerName,
        tail: options?.tail ?? false,
        stream: options?.stream ?? 'stdout',
        maxLines: options?.maxLines ?? 1000,
      });
      return data;
    } catch (error: any) {
      logger.warn({ err: error, workloadId, containerName }, 'Failed to get nilCC container logs');
      return null;
    }
  }

  async listArtifacts(): Promise<any[]> {
    try {
      const { data } = await this.client.get('/api/v1/artifacts/list');
      return data?.artifacts ?? data ?? [];
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list nilCC artifacts');
      throw new Error(`NilCC list artifacts failed: ${error.message}`);
    }
  }

  async listWorkloadTiers(): Promise<NilCCTier[]> {
    if (this.workloadTierCache && this.workloadTierCache.expiresAt > Date.now()) {
      return this.workloadTierCache.tiers;
    }

    try {
      const { data } = await this.client.get('/api/v1/workload-tiers/list');
      const rawTiers = Array.isArray(data?.tiers) ? data.tiers : Array.isArray(data) ? data : [];
      const tiers: NilCCTier[] = rawTiers.map((tier: any) => ({
        id: tier.tierId || tier.id,
        name: tier.name,
        cpus: Number(tier.cpus ?? tier.cpu ?? tier.vcpus ?? 0),
        memory: Number(tier.memory ?? tier.memoryMb ?? tier.ramMb ?? tier.ram ?? 0),
        disk: Number(tier.disk ?? tier.diskGb ?? tier.storageGb ?? tier.storage ?? 0),
        gpus: Number(tier.gpus ?? tier.gpu ?? 0),
      }));
      this.workloadTierCache = {
        tiers,
        expiresAt: Date.now() + this.cacheTtlMs,
      };
      return tiers;
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to list nilCC workload tiers');
      throw new Error(`NilCC list workload tiers failed: ${error.message}`);
    }
  }

  private async ensureTierMatch(config: { cpus: number; memory: number; disk: number; gpus?: number }): Promise<void> {
    const tiers = await this.listWorkloadTiers();
    const gpus = config.gpus ?? 0;
    const match = tiers.find(
      (tier) =>
        Number(tier.cpus) === Number(config.cpus) &&
        Number(tier.memory) === Number(config.memory) &&
        Number(tier.disk) === Number(config.disk) &&
        Number(tier.gpus ?? 0) === Number(gpus),
    );

    if (!match) {
      throw new Error(
        `Requested resources (cpus=${config.cpus}, memory=${config.memory}, disk=${config.disk}, gpus=${gpus}) do not match any nilCC workload tier`,
      );
    }
  }

  async getLatestArtifactsVersion(): Promise<string> {
    const cached = this.artifactsVersionCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const artifacts = await this.listArtifacts();
    const first = Array.isArray(artifacts) ? artifacts[0] : undefined;
    const version = first?.version || first?.artifactVersion || first?.name;

    if (!version) {
      throw new Error('NilCC artifacts list is empty');
    }

    this.artifactsVersionCache = {
      value: version,
      expiresAt: Date.now() + this.cacheTtlMs,
    };

    return version;
  }

  private prepareFiles(files?: Record<string, string | Buffer>): Record<string, string> | undefined {
    if (!files) {
      return undefined;
    }

    const encoded: Record<string, string> = {};

    for (const [path, contents] of Object.entries(files)) {
      if (contents === undefined || contents === null) {
        continue;
      }

      if (Buffer.isBuffer(contents)) {
        encoded[path] = contents.toString('base64');
      } else if (typeof contents === 'string') {
        encoded[path] = Buffer.from(contents, 'utf8').toString('base64');
      } else {
        encoded[path] = Buffer.from(JSON.stringify(contents)).toString('base64');
      }
    }

    return encoded;
  }

  async getAttestationReport(
    publicUrl?: string,
    { required = false, retries = 5 }: { required?: boolean; retries?: number } = {},
  ): Promise<Record<string, unknown> | undefined> {
    if (!publicUrl) {
      return undefined;
    }

    const normalized = publicUrl.endsWith('/') ? publicUrl.slice(0, -1) : publicUrl;
    const attestationUrl = `${normalized}/nilcc/api/v2/report`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const { data } = await axios.get(attestationUrl, { timeout: 10000 });
        return data;
      } catch (error) {
        const isLastAttempt = attempt === retries - 1;
        if (isLastAttempt) {
          if (required) {
            throw new Error(`Failed to retrieve nilCC attestation: ${(error as Error).message}`);
          }
          logger.warn({ err: error, attestationUrl }, 'Unable to retrieve nilCC attestation report');
          return undefined;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return undefined;
  }

  async deleteWorkload(workloadId: string): Promise<void> {
    if (!workloadId) {
      return;
    }
    try {
      await this.client.post('/api/v1/workloads/delete', { workloadId });
      logger.info({ workloadId }, 'NilCC workload deleted');
    } catch (error: any) {
      logger.warn({ err: error, workloadId }, 'Failed to delete nilCC workload');
    }
  }
}

export const nilccService = new NilCCService();
