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

class NilCCService {
  private client: AxiosInstance;
  private artifactsVersionCache?: { value: string; expiresAt: number };

  constructor() {
    if (!envConfig.NILCC_API_KEY) {
      logger.warn('NILCC_API_KEY not configured - nilCC features will be unavailable');
    }

    this.client = axios.create({
      baseURL: envConfig.NILCC_BASE_URL,
      headers: envConfig.NILCC_API_KEY ? { 'x-api-key': envConfig.NILCC_API_KEY } : {},
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
        serviceToExpose: input.publicContainerName,
        servicePortToExpose: input.publicContainerPort,
        cpus: input.cpus,
        memory: input.memory,
        disk: input.disk,
        gpus: input.gpus ?? 0,
        artifactsVersion: input.artifactsVersion,
        envVars: input.envVars,
        files: this.prepareFiles(input.files),
        dockerCredentials: input.dockerCredentials,
      };

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

  async getLogs(workloadId: string): Promise<string> {
    try {
      const { data } = await this.client.post('/api/v1/workloads/logs', { workloadId });
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error: any) {
      logger.error({ err: error, workloadId }, 'Failed to get nilCC workload logs');
      throw new Error(`NilCC get logs failed: ${error.message}`);
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
      expiresAt: Date.now() + 5 * 60 * 1000,
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
}

export const nilccService = new NilCCService();
