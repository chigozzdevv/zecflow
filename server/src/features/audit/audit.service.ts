import { AuditModel } from './audit.model';

interface CreateAuditInput {
  actorId: string;
  organizationId: string;
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
}

export const recordAudit = (input: CreateAuditInput) => {
  return AuditModel.create({
    actor: input.actorId,
    organization: input.organizationId,
    action: input.action,
    resource: input.resource,
    metadata: input.metadata ?? {},
  });
};

export const listAuditForOrganization = (organizationId: string, limit = 20) => {
  return AuditModel.find({ organization: organizationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};
