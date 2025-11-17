import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { createTrigger, listTriggers } from './triggers.service';
import { triggerRegistry } from './triggers.registry';
import { TriggerModel } from './triggers.model';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { createRun } from '@/features/runs/runs.service';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { verifyGithubSignature } from '@/shared/services/github-webhook.service';
import { logger } from '@/utils/logger';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';

export const createTriggerHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const trigger = await createTrigger({
    name: req.body.name,
    type: req.body.type,
    config: req.body.config ?? {},
    connectorId: req.body.connectorId,
    organizationId: user.organization.toString(),
    userId: user.id,
  });
  res.status(HttpStatus.CREATED).json({ trigger });
};

export const listTriggersHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const triggers = await listTriggers(user.organization.toString());
  res.json({ triggers });
};

export const listTriggerDefinitions = (_req: AuthenticatedRequest, res: Response): void => {
  res.json({ triggers: triggerRegistry });
};

export const testTriggerHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const trigger = await TriggerModel.findById(req.params.triggerId);
  if (!trigger) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Trigger not found' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user || trigger.organization.toString() !== user.organization.toString()) {
    res.status(HttpStatus.FORBIDDEN).json({ message: 'Not allowed' });
    return;
  }
  const workflow = await WorkflowModel.findOne({ trigger: trigger.id });
  if (!workflow) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Workflow not found for trigger' });
    return;
  }
  const payload = req.body?.payload ?? { message: 'test-trigger' };
  const run = await createRun({ workflowId: workflow.id, triggerId: trigger.id, payload });
  res.json({ runId: run.id, status: 'queued' });
};

const branchFromRef = (ref?: string): string | undefined => {
  if (!ref) {
    return undefined;
  }
  return ref.replace('refs/heads/', '');
};

const pathsMatch = (changed: string[], filters?: string[]): boolean => {
  if (!filters || filters.length === 0) {
    return true;
  }
  return changed.some((file) => filters.some((pattern) => file.startsWith(pattern)));
};

export const triggerWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const triggerId = req.params.triggerId;
  const trigger = await TriggerModel.findById(triggerId);
  if (!trigger) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Trigger not found' });
    return;
  }

  const connector = trigger.connector
    ? await ConnectorModel.findById(trigger.connector).then((doc) => {
        if (!doc) {
          return null;
        }
        return {
          ...doc.toObject(),
          config: decryptConnectorConfig(doc.type, doc.config as Record<string, unknown>),
        };
      })
    : null;

  if (trigger.type === 'github-commit') {
    const secret = (connector?.config as Record<string, unknown>)?.webhookSecret as string | undefined;
    if (!secret || !req.rawBody) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Secret missing' });
      return;
    }
    if (!verifyGithubSignature(req.rawBody, req.headers['x-hub-signature-256'], secret)) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Invalid signature' });
      return;
    }
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      res.status(HttpStatus.ACCEPTED).json({ message: 'Event ignored' });
      return;
    }
    const branch = (trigger.config as Record<string, unknown>).branch as string | undefined;
    const pushedBranch = branchFromRef(req.body.ref);
    if (branch && branch !== pushedBranch) {
      res.status(HttpStatus.ACCEPTED).json({ message: 'Branch ignored' });
      return;
    }
    const includePaths = (trigger.config as Record<string, string[]>).includePaths;
    const excludePaths = (trigger.config as Record<string, string[]>).excludePaths;
    const allChanged = (req.body.commits || []).flatMap((commit: any) => [
      ...(commit.added || []),
      ...(commit.modified || []),
      ...(commit.removed || []),
    ]);
    if (includePaths && !pathsMatch(allChanged, includePaths)) {
      res.status(HttpStatus.ACCEPTED).json({ message: 'No matching files' });
      return;
    }
    if (excludePaths && pathsMatch(allChanged, excludePaths)) {
      res.status(HttpStatus.ACCEPTED).json({ message: 'Excluded files changed' });
      return;
    }
  } else if (trigger.type === 'http-webhook') {
    const secret = (trigger.config as Record<string, unknown>)?.secret as string | undefined;
    if (secret) {
      const provided = req.headers['x-trigger-secret'];
      if (provided !== secret) {
        res.status(HttpStatus.FORBIDDEN).json({ message: 'Invalid secret' });
        return;
      }
    }
  }

  const workflow = await WorkflowModel.findOne({ trigger: trigger.id, status: 'published' });
  if (!workflow) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Workflow not found for trigger' });
    return;
  }

  try {
    const run = await createRun({
      workflowId: workflow.id,
      triggerId: trigger.id,
      payload: typeof req.body === 'object' ? req.body : { data: req.body },
    });

    res.json({ runId: run.id, status: 'queued' });
  } catch (error) {
    logger.error({ err: error, triggerId: trigger.id }, 'Failed to enqueue webhook run');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Failed to enqueue run' });
  }
};
