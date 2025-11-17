import { NillionWorkloadModel } from './nillion-compute.model';
import { nilccService } from './nilcc.service';
import { logger } from '@/utils/logger';

interface RegisterWorkloadInput {
  name: string;
  workloadId?: string;
  description?: string;
  config: Record<string, unknown>;
  organizationId: string;
}

export const registerWorkload = async (input: RegisterWorkloadInput) => {
  let publicUrl: string | undefined;
  let workloadId = input.workloadId;
  let attestation: Record<string, unknown> | undefined;

  // If config contains dockerCompose, create a workload via nilCC
  const cfg = (input.config || {}) as Record<string, any>;
  if (!workloadId && cfg.dockerCompose && cfg.publicContainerName && cfg.publicContainerPort) {
    const artifactsVersion = cfg.artifactsVersion || (await nilccService.getLatestArtifactsVersion());

    const created = await nilccService.createWorkload({
      name: input.name,
      dockerCompose: String(cfg.dockerCompose),
      publicContainerName: String(cfg.publicContainerName),
      publicContainerPort: Number(cfg.publicContainerPort),
      cpus: Number(cfg.cpus ?? 1),
      memory: Number(cfg.memory ?? 1024),
      disk: Number(cfg.disk ?? 10),
      gpus: cfg.gpus ? Number(cfg.gpus) : undefined,
      artifactsVersion: String(artifactsVersion),
      envVars: cfg.envVars as Record<string, string> | undefined,
      files: cfg.files as Record<string, string | Buffer> | undefined,
      dockerCredentials: cfg.dockerCredentials as Array<{ server: string; username: string; password: string }> | undefined,
    });
    workloadId = created.id;
    publicUrl = created.publicUrl;
  }

  // Validate workload exists and resolve public URL
  if (workloadId) {
    const wl = await nilccService.getWorkload(workloadId);
    publicUrl = publicUrl || nilccService.extractPublicUrl(wl || {});
  } else {
    throw new Error('Provide a workloadId or dockerCompose config to register a nilCC workload');
  }

  if (publicUrl) {
    try {
      attestation = await nilccService.getAttestationReport(publicUrl);
    } catch (error) {
      logger.warn({ err: error, workloadId }, 'Unable to fetch nilCC attestation during workload registration');
    }
  }

  return NillionWorkloadModel.create({
    name: input.name,
    workloadId: String(workloadId),
    description: input.description,
    config: input.config,
    organization: input.organizationId,
    publicUrl,
    attestation,
  });
};

export const listWorkloads = (organizationId: string) => {
  return NillionWorkloadModel.find({ organization: organizationId }).lean();
};
