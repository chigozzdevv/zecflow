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
    logger.debug({ workloadId, relativePath }, '[NilCC] Executing workload');

    const rec = await NillionWorkloadModel.findOne({ workloadId }).lean();
    if (!rec || !rec.publicUrl) {
      logger.error({ workloadId }, '[NilCC] Workload not found or missing publicUrl');
      throw new Error(`NilCC workload ${workloadId} not found or missing publicUrl`);
    }

    const attestation = await nilccService.getAttestationReport(rec.publicUrl, { required: true });
    const url = new URL(relativePath || '/', rec.publicUrl).toString();

    logger.debug({ workloadId, url }, '[NilCC] Sending request to workload');
    const { data } = await axios.post(url, payload, { timeout: 30000 });

    logger.info({ workloadId }, '[NilCC] Workload execution completed');
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
    const startTime = Date.now();
    try {
      logger.info({ workflowRunId, nodeCount: graph.nodes.length, inputKeys: Object.keys(inputs) }, '[NilCC] Starting block graph execution');

      logger.debug({ workflowRunId }, '[NilCC] Generating Node.js code from block graph');
      const nodeJsCode = nillionCodeGeneratorService.generateNodeJsCode(graph, inputs);
      logger.debug({ workflowRunId, codeLength: nodeJsCode.length }, '[NilCC] Code generation complete');

      const inputJson = JSON.stringify(inputs);
      const composeYaml = this.generateComputeServiceCompose();

      logger.debug({ workflowRunId }, '[NilCC] Fetching latest artifacts version');
      const artifactsVersion = await nilccService.getLatestArtifactsVersion();
      logger.debug({ workflowRunId, artifactsVersion }, '[NilCC] Artifacts version retrieved');

      logger.debug({ workflowRunId }, '[NilCC] Docker-compose generated');

      const workloadName = `workflow-${workflowRunId}-${Date.now()}`;

      const files = {
        'workflow.js': nodeJsCode,
        'input.json': inputJson,
      };

      logger.debug({ workflowRunId }, '[NilCC] Fetching workload tiers');
      const tiers = await nilccService.listWorkloadTiers();
      const tier = tiers[0];
      if (!tier) {
        logger.error({ workflowRunId }, '[NilCC] No workload tiers available');
        throw new Error('No available nilCC workload tiers');
      }
      logger.debug({ workflowRunId, tier: tier.id, cpus: tier.cpus, memory: tier.memory }, '[NilCC] Selected workload tier');

      logger.info({ workflowRunId, workloadName }, '[NilCC] Creating workload');
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

      logger.info({ workflowRunId, workloadId: workloadResult.id, publicUrl: workloadResult.publicUrl }, '[NilCC] Workload created successfully');

      logger.info({ workflowRunId, workloadId: workloadResult.id }, '[NilCC] Waiting for container to become ready');
      await this.waitForContainerReady(workloadResult.id, workloadResult.publicUrl);

      logger.info({ workflowRunId, workloadId: workloadResult.id }, '[NilCC] Polling for execution output');
      const output = await this.pollForOutput(workloadResult.id, workloadResult.publicUrl, workflowRunId);

      logger.info({ workflowRunId, workloadId: workloadResult.id }, '[NilCC] Fetching attestation report');
      const attestation = await nilccService.getAttestationReport(workloadResult.publicUrl);

      const duration = Date.now() - startTime;
      logger.info({ workflowRunId, workloadId: workloadResult.id, durationMs: duration }, '[NilCC] Block graph execution completed successfully');
      return {
        output,
        attestation,
        result: output,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, workflowRunId, durationMs: duration }, '[NilCC] Block graph execution failed');
      throw new Error(`Nillion block graph execution failed: ${error.message}`);
    } finally {
      if (createdWorkloadId) {
        logger.debug({ workflowRunId, workloadId: createdWorkloadId }, '[NilCC] Cleaning up workload');
        await nilccService.deleteWorkload(createdWorkloadId);
        logger.info({ workloadId: createdWorkloadId }, '[NilCC] Workload deleted');
      }
    }
  }

  private generateComputeServiceCompose(): string {
    return `services:
  compute:
    image: node:20-alpine
    working_dir: /app
    command: |
      sh -c "ls -la /app && node /app/workflow.js"
    volumes:
      - "\${FILES}:/app"
`;
  }

  private async waitForContainerReady(workloadId: string, publicUrl: string | undefined): Promise<void> {
    if (!publicUrl) {
      logger.warn({ workloadId }, '[NilCC] No public URL, skipping container ready check');
      return;
    }

    const healthUrl = `${publicUrl}/health`;
    const maxWaitAttempts = 60;
    const waitIntervalMs = 2000;

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
          logger.info({ workloadId, attempt }, '[NilCC] Container ready');
          return;
        }

        logger.debug({ workloadId, attempt, status: response.status }, '[NilCC] Container not ready, retrying');
      } catch (error: any) {
        logger.debug({ workloadId, attempt, error: error.message }, '[NilCC] Health check failed, retrying');
      }

      await this.sleep(waitIntervalMs);
    }

    logger.warn({ workloadId, maxWaitAttempts }, '[NilCC] Container readiness check timed out, proceeding anyway');
  }

  private async pollForOutput(workloadId: string, publicUrl: string | undefined, workflowRunId: string): Promise<any> {
    if (!publicUrl) {
      logger.error({ workloadId, workflowRunId }, '[NilCC] No public URL for polling');
      throw new Error('No public URL available for workload');
    }

    const baseOutputUrl = `${publicUrl}/output.json`;
    const pollIntervalMsRaw = Number(envConfig.NILCC_POLL_INTERVAL_MS ?? 3000);
    const pollIntervalMs = Number.isFinite(pollIntervalMsRaw) && pollIntervalMsRaw > 0 ? pollIntervalMsRaw : 3000;
    const pollTimeoutMs = Number(envConfig.NILCC_POLL_TIMEOUT_MS ?? 600_000);
    const unlimitedPolling = pollTimeoutMs <= 0;
    const maxAttempts = unlimitedPolling ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.ceil(pollTimeoutMs / pollIntervalMs));

    logger.info({ workloadId, workflowRunId, pollIntervalMs, maxAttempts }, '[NilCC] Starting output polling');

    try {
      const earlyLogs = await nilccService.getLogs(workloadId, { tail: false });
      if (earlyLogs) {
        logger.info({ workloadId, logs: JSON.stringify(earlyLogs).slice(0, 2000) }, '[NilCC] Container startup logs');
      }
    } catch (logErr) {
      logger.warn({ workloadId, error: (logErr as Error).message }, '[NilCC] Could not fetch early container logs');
    }

    let attempt = 1;
    while (unlimitedPolling || attempt <= maxAttempts) {
      try {
        await this.sleep(pollIntervalMs);
        
        const outputUrl = `${baseOutputUrl}?_t=${Date.now()}`;
        const response = await axios.get(outputUrl, {
          timeout: 10000,
          validateStatus: () => true,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        });

        if (attempt === 1 || attempt % 10 === 0) {
          logger.info({ workloadId, attempt, status: response.status }, '[NilCC] Poll attempt');
        }

        if (response.status === 500) {
          const errorBody = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
          logger.error({ workloadId, attempt, errorBody }, '[NilCC] Workflow returned error 500');
          throw new Error(`Workflow execution failed: ${errorBody}`);
        }

        if (response.status === 200 || response.status === 304) {
          const data = response.data;
          if (data && typeof data === 'object' && data.status === 'processing') {
            if (attempt === 1 || attempt % 10 === 0) {
              logger.info({ workloadId, attempt }, '[NilCC] Still processing');
            }
            attempt += 1;
            continue;
          }
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            logger.info({ workloadId, attempt }, '[NilCC] Output received');
            return data;
          }
        }

        if (response.status === 202) {
          if (attempt === 1 || attempt % 10 === 0) {
            logger.info({ workloadId, attempt }, '[NilCC] Processing (202)');
          }
          attempt += 1;
          continue;
        }

        logger.info({ workloadId, attempt, status: response.status }, '[NilCC] Unexpected status, retrying');
        attempt += 1;
      } catch (error: any) {
        const isLastAttempt = !unlimitedPolling && attempt === maxAttempts;
        if (isLastAttempt) {
          logger.error({ err: error, workloadId, attempt }, '[NilCC] Failed to retrieve output after max attempts');

          try {
            logger.info({ workloadId }, '[NilCC] Retrieving logs for debugging');
            const systemLogs = await nilccService.getLogs(workloadId, { tail: false });
            logger.info({ workloadId, logs: JSON.stringify(systemLogs).slice(0, 3000) }, '[NilCC] System logs');
          } catch (logError) {
            logger.error({ err: logError, workloadId }, '[NilCC] Failed to retrieve logs');
          }

          throw new Error('Nillion compute workload execution timeout');
        }

        if (attempt === 1 || attempt % 10 === 0) {
          logger.info({ workloadId, attempt, error: error.message }, '[NilCC] Output not ready, retrying');
        }
        attempt += 1;
      }
    }

    logger.error({ workloadId, workflowRunId }, '[NilCC] Polling exhausted without output');
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
