import axios from 'axios';
import { NillionWorkloadModel } from './nillion-compute.model';
import { nillionCodeGeneratorService, NillionBlockGraph } from './nillion-code-generator.service';
import { dockerComposeGeneratorService } from './docker-compose-generator.service';
import { nilccService } from './nilcc.service';
import { logger } from '@/utils/logger';
import { envConfig } from '@/config/env';

interface NilCCInvocationResult {
  response: any;
  attestation?: Record<string, unknown>;
  result: any;
}

interface NilCCBlockGraphResult {
  output: any;
  attestation?: Record<string, unknown>;
  result: any;
}

class NilCCExecutionService {
  async execute(
    workloadId: string,
    payload: Record<string, unknown>,
    relativePath: string = '/',
  ): Promise<NilCCInvocationResult> {
    const rec = await NillionWorkloadModel.findOne({ workloadId }).lean();
    if (!rec || !rec.publicUrl) {
      throw new Error(`NilCC workload ${workloadId} not found or missing publicUrl`);
    }

    const attestation = await nilccService.getAttestationReport(rec.publicUrl, { required: true });
    const url = new URL(relativePath || '/', rec.publicUrl).toString();
    const { data } = await axios.post(url, payload, { timeout: 30000 });
    return {
      response: data,
      attestation,
      result: data,
    };
  }

  async executeBlockGraph(
    graph: NillionBlockGraph,
    inputs: Record<string, any>,
    workflowRunId: string,
  ): Promise<NilCCBlockGraphResult> {
    let createdWorkloadId: string | null = null;
    let createdWorkloadUrl: string | undefined;
    try {
      logger.info({ workflowRunId, nodeCount: graph.nodes.length }, 'Executing nillion block graph');

      const nodeJsCode = nillionCodeGeneratorService.generateNodeJsCode(graph, inputs);
      const inputJson = JSON.stringify(inputs);
      const composeYaml = this.generateComputeServiceCompose(nodeJsCode, inputJson);
      const artifactsVersion = await nilccService.getLatestArtifactsVersion();

      logger.info({ workflowRunId, composeYaml }, 'Generated docker-compose for NilCC');

      const workloadName = `workflow-${workflowRunId}-${Date.now()}`;

      const files = {};

      const tiers = await nilccService.listWorkloadTiers();
      const tier = tiers[0];
      if (!tier) {
        throw new Error('No available nilCC workload tiers');
      }

      const workloadResult = await nilccService.createWorkload({
        name: workloadName,
        dockerCompose: composeYaml,
        publicContainerName: 'compute',
        publicContainerPort: 3000,
        cpus: tier.cpus,
        memory: tier.memory,
        disk: tier.disk,
        gpus: tier.gpus,
        artifactsVersion: artifactsVersion,
        files,
      });

      createdWorkloadId = workloadResult.id;
      createdWorkloadUrl = workloadResult.publicUrl;

      logger.info({ workloadId: workloadResult.id, publicUrl: workloadResult.publicUrl }, 'Nillion compute workload created');

      await this.waitForContainerReady(workloadResult.id, workloadResult.publicUrl);
      
      const output = await this.pollForOutput(workloadResult.id, workloadResult.publicUrl, workflowRunId);
      const attestation = await nilccService.getAttestationReport(workloadResult.publicUrl);

      logger.info({ workloadId: workloadResult.id }, 'Nillion block graph execution completed');
      return {
        output,
        attestation,
        result: output,
      };
    } catch (error: any) {
      logger.error({ err: error, workflowRunId }, 'Failed to execute nillion block graph');
      throw new Error(`Nillion block graph execution failed: ${error.message}`);
    } finally {
      if (createdWorkloadId) {
        await nilccService.deleteWorkload(createdWorkloadId);
        if (createdWorkloadUrl) {
          logger.info({ workloadId: createdWorkloadId, publicUrl: createdWorkloadUrl }, 'Nillion compute workload torn down');
        }
      }
    }
  }

  private generateComputeServiceCompose(workflowCode: string, inputJson: string): string {
    const escapedCode = Buffer.from(workflowCode).toString('base64');
    const escapedInput = Buffer.from(inputJson).toString('base64');
    
    return `services:
  compute:
    image: node:18-alpine
    command:
      - sh
      - -c
      - |
        echo "Starting container..."
        mkdir -p /app
        echo "${escapedCode}" | base64 -d > /app/workflow.js
        echo "${escapedInput}" | base64 -d > /app/input.json
        echo "Files created, starting Node..."
        cd /app && node workflow.js
`;
  }

  private async waitForContainerReady(workloadId: string, publicUrl: string | undefined): Promise<void> {
    if (!publicUrl) {
      return;
    }

    const healthUrl = `${publicUrl}/health`;
    const maxWaitAttempts = 60;
    const waitIntervalMs = 2000;

    logger.info({ workloadId }, 'Waiting for container to become ready...');

    for (let attempt = 1; attempt <= maxWaitAttempts; attempt++) {
      try {
        const response = await axios.get(`${healthUrl}?_t=${Date.now()}`, {
          timeout: 5000,
          validateStatus: () => true,
          headers: {
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache',
          },
        });

        if (response.status === 200) {
          logger.info({ workloadId, attempt }, 'Container is ready');
          return;
        }

        logger.info({ workloadId, attempt, status: response.status }, 'Container not ready yet...');
      } catch (error: any) {
        logger.info({ workloadId, attempt, error: error.message }, 'Waiting for container startup...');
      }

      await this.sleep(waitIntervalMs);
    }

    logger.warn({ workloadId }, 'Container readiness check timed out, proceeding with polling anyway');
  }

  private async pollForOutput(workloadId: string, publicUrl: string | undefined, workflowRunId: string): Promise<any> {
    if (!publicUrl) {
      throw new Error('No public URL available for workload');
    }

    const baseOutputUrl = `${publicUrl}/output.json`;
    const pollIntervalMsRaw = Number(envConfig.NILCC_POLL_INTERVAL_MS ?? 3000);
    const pollIntervalMs = Number.isFinite(pollIntervalMsRaw) && pollIntervalMsRaw > 0 ? pollIntervalMsRaw : 3000;
    const pollTimeoutMs = Number(envConfig.NILCC_POLL_TIMEOUT_MS ?? 600_000);
    const unlimitedPolling = pollTimeoutMs <= 0;
    const maxAttempts = unlimitedPolling ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.ceil(pollTimeoutMs / pollIntervalMs));

    let attempt = 1;
    while (unlimitedPolling || attempt <= maxAttempts) {
      try {
        await this.sleep(pollIntervalMs);
        
        const outputUrl = `${baseOutputUrl}?_t=${Date.now()}`;
        const response = await axios.get(outputUrl, {
          timeout: 10000,
          validateStatus: (status) => status < 500,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        });

        logger.info({ workloadId, attempt, status: response.status }, 'Poll response received');

        if (response.status === 200 || response.status === 304) {
          const data = response.data;
          if (data && typeof data === 'object' && data.status === 'processing') {
            logger.info({ workloadId, attempt }, 'Workflow still processing...');
            attempt += 1;
            continue;
          }
          if (data && Object.keys(data).length > 0 && !data.status) {
            logger.info({ workloadId, attempt }, 'Workflow output received');
            return data;
          }
          logger.info({ workloadId, attempt, data }, 'Received data but continuing poll...');
          attempt += 1;
          continue;
        }

        if (response.status === 202) {
          logger.info({ workloadId, attempt }, 'Workflow still processing (202)...');
          attempt += 1;
          continue;
        }

        logger.info({ workloadId, attempt, status: response.status }, 'Unexpected status, retrying...');
        attempt += 1;
      } catch (error: any) {
        const isLastAttempt = !unlimitedPolling && attempt === maxAttempts;
        if (isLastAttempt) {
          logger.error({ err: error, workloadId, attempt }, 'Failed to retrieve output after max attempts');

          try {
            const systemLogs = await nilccService.getLogs(workloadId, { tail: false });
            logger.info({ workloadId, logs: JSON.stringify(systemLogs) }, 'System logs');
            
            const containerStdout = await nilccService.getContainerLogs(workloadId, 'compute', { stream: 'stdout' });
            if (containerStdout) {
              logger.info({ workloadId, containerLogs: JSON.stringify(containerStdout) }, 'Container stdout');
            }
            
            const containerStderr = await nilccService.getContainerLogs(workloadId, 'compute', { stream: 'stderr' });
            if (containerStderr) {
              logger.info({ workloadId, containerLogs: JSON.stringify(containerStderr) }, 'Container stderr');
            }
          } catch (logError) {
            logger.error({ err: logError, workloadId }, 'Failed to retrieve logs');
          }

          throw new Error('Nillion compute workload execution timeout');
        }

        logger.info({ workloadId, attempt, error: error.message }, 'Output not ready yet, retrying...');
        attempt += 1;
      }
    }

    throw new Error('Failed to retrieve output');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatLogs(logData: unknown): string[] {
    if (!logData) return [];
    if (typeof logData === 'string') return [logData];
    if (Array.isArray(logData)) {
      return logData.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)));
    }

    if (typeof logData === 'object') {
      const lines: string[] = [];
      const payload = logData as Record<string, unknown>;

      const pushArray = (header: string | null, value: unknown) => {
        if (!Array.isArray(value)) return;
        if (header) lines.push(header);
        value.forEach((entry) => {
          lines.push(typeof entry === 'string' ? entry : JSON.stringify(entry));
        });
      };

      pushArray(null, payload.lines);
      pushArray(null, payload.logs);

      if (payload.containers && typeof payload.containers === 'object' && payload.containers !== null) {
        Object.entries(payload.containers as Record<string, unknown>).forEach(([name, value]) => {
          pushArray(`--- container ${name} ---`, value);
        });
      }

      if (lines.length) {
        return lines;
      }

      return [JSON.stringify(payload)];
    }

    return [String(logData)];
  }
}

export const nilccExecutionService = new NilCCExecutionService();
