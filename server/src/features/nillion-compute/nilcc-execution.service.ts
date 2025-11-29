import axios from 'axios';
import { NillionWorkloadModel } from './nillion-compute.model';
import { nillionCodeGeneratorService, NillionBlockGraph } from './nillion-code-generator.service';
import { dockerComposeGeneratorService } from './docker-compose-generator.service';
import { nilccService } from './nilcc.service';
import { logger } from '@/utils/logger';

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
      const composeYaml = this.generateComputeServiceCompose();
      const packageJson = dockerComposeGeneratorService.generatePackageJson();
      const artifactsVersion = await nilccService.getLatestArtifactsVersion();

      const workloadName = `workflow-${workflowRunId}-${Date.now()}`;

      const files = {
        'workflow.js': nodeJsCode,
        'package.json': packageJson,
        'input.json': JSON.stringify(inputs),
      };

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

      const output = await this.pollForOutput(workloadResult.id, workloadResult.publicUrl);
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

  private generateComputeServiceCompose(): string {
    return `version: '3.8'
services:
  compute:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - "\${FILES}/workflow.js:/app/workflow.js"
      - "\${FILES}/input.json:/app/input.json"
    command: |
      sh -c "
        node workflow.js
        if [ -f output.json ]; then
          npm install -g http-server
          http-server /app -p 3000 --cors
        else
          echo 'Execution failed' && exit 1
        fi
      "
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
`;
  }

  private async pollForOutput(workloadId: string, publicUrl?: string, maxAttempts: number = 60): Promise<any> {
    if (!publicUrl) {
      throw new Error('No public URL available for workload');
    }

    const outputUrl = `${publicUrl}/output.json`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.sleep(2000);

        const response = await axios.get(outputUrl, { timeout: 5000 });
        return response.data;
      } catch (error: any) {
        if (attempt === maxAttempts) {
          logger.error({ err: error, workloadId, attempt }, 'Failed to retrieve output after max attempts');

          try {
            const logs = await nilccService.getLogs(workloadId);
            logger.info({ workloadId, logs }, 'Workload logs');
          } catch (logError) {
            logger.error({ err: logError }, 'Failed to retrieve logs');
          }

          throw new Error('Nillion compute workload execution timeout');
        }

        logger.debug({ workloadId, attempt }, 'Output not ready yet, retrying...');
      }
    }

    throw new Error('Failed to retrieve output');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const nilccExecutionService = new NilCCExecutionService();
