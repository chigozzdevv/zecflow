import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { DatasetModel } from '@/features/datasets/datasets.model';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { createWorkflow, listWorkflows, setWorkflowStatus, deleteWorkflow } from './workflows.service';

export const createWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflow = await createWorkflow({
    name: req.body.name,
    description: req.body.description,
    organizationId: user.organization.toString(),
    triggerId: req.body.triggerId,
    datasetId: req.body.datasetId,
  });
  res.status(HttpStatus.CREATED).json({ workflow });
};

export const listWorkflowsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflows = await listWorkflows(user.organization.toString());
  res.json({ workflows });
};

export const publishWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workflow = await setWorkflowStatus(req.params.workflowId, 'published', user.organization.toString());

  let integrationSnippet: string | undefined;
  if (workflow.dataset) {
    const ds = await DatasetModel.findById(workflow.dataset).lean();
    if (ds && typeof ds.nildbCollectionId === 'string') {
      const collectionId = ds.nildbCollectionId;
      const schema = (ds.schema ?? {}) as Record<string, any>;
      const properties = (schema.properties && typeof schema.properties === 'object'
        ? (schema.properties as Record<string, any>)
        : {}) as Record<string, any>;
      const fieldEntries = Object.entries(properties).slice(0, 12);

      const fieldNames = fieldEntries.map(([name]) => name);
      const numericFields = fieldEntries
        .filter(([, def]) => def && def.type === 'number')
        .map(([name]) => name);

      const initialStateLines = fieldNames.map((name) => `    ${name}: '',`);
      const payloadLines = fieldNames.map((name) => {
        const isNumber = numericFields.includes(name);
        const expr = isNumber ? `Number(values.${name})` : `values.${name}`;
        return `      ${name}: ${expr},`;
      });

      const required = Array.isArray(schema.required) ? (schema.required as string[]) : fieldNames;
      const requiredChecks = required
        .filter((name) => fieldNames.includes(name))
        .map((name) => `    if (!values.${name} || String(values.${name}).trim() === '') return setError('${name} is required');`);

      const formInputs = fieldNames.map((name) => {
        return [
          `        <div className="space-y-1">`,
          `          <label className="block text-xs font-medium text-zinc-300">${name}</label>`,
          `          <input`,
          `            name="${name}"`,
          `            value={values.${name}}`,
          `            onChange={(e) => setValues((v) => ({ ...v, ${name}: e.target.value }))}`,
          `            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-[#6758c1] focus:ring-2 focus:ring-[#6758c1]/30 transition-all"`,
          `          />`,
          `        </div>`,
        ].join('\n');
      });

      let inboxUrl = 'https://your-backend.example.com/loan/inbox';
      if (workflow.trigger) {
        const trigger = await TriggerModel.findById(workflow.trigger).lean();
        if (trigger && trigger.type === 'custom-http-poll' && trigger.connector) {
          const connector = await ConnectorModel.findById(trigger.connector).lean();
          if (connector) {
            const connectorConfig = decryptConnectorConfig(
              connector.type,
              (connector.config as Record<string, unknown>) ?? {},
            );
            const baseUrl = (connectorConfig.baseUrl as string) || '';
            const triggerConfig = (trigger.config as Record<string, unknown>) ?? {};
            const relativePath = (triggerConfig.relativePath as string) || '/';
            if (baseUrl) {
              try {
                inboxUrl = new URL(relativePath || '/', baseUrl).toString();
              } catch {
                inboxUrl = baseUrl + relativePath;
              }
            }
          }
        }
      }

      integrationSnippet = [
        `import { useState } from 'react';`,
        `import type { SecretVaultUserClient } from '@nillion/secretvaults';`,
        ``,
        `type FormValues = {`,
        ...initialStateLines,
        `};`,
        ``,
        `type Props = {`,
        `  nillionClient: SecretVaultUserClient;`,
        `  ownerDid: string;`,
        `};`,
        ``,
        `export function ZecflowWorkflowForm({ nillionClient, ownerDid }: Props) {`,
        `  const [values, setValues] = useState<FormValues>({`,
        ...initialStateLines,
        `  });`,
        `  const [error, setError] = useState<string | null>(null);`,
        `  const [submitting, setSubmitting] = useState(false);`,
        ``,
        `  async function handleSubmit(e: React.FormEvent) {`,
        `    e.preventDefault();`,
        `    setError(null);`,
        ...requiredChecks,
        `    if (!nillionClient || !ownerDid) return;`,
        `    setSubmitting(true);`,
        `    try {`,
        `      const payload = {`,
        ...payloadLines,
        `      };`,
        `      const createResponse = await nillionClient.createData({`,
        `        owner: ownerDid,`,
        `        collection: '${collectionId}',`,
        `        data: [payload],`,
        `        acl: { grantee: ownerDid, read: true, write: true, execute: true },`,
        `      });`,
        `      const firstNode = Object.values(createResponse)[0] as any;`,
        `      const createdIds = firstNode?.data?.created ?? [];`,
        `      const documentId = createdIds[0];`,
        `      if (!documentId) throw new Error('NilDB did not return a created document id');`,
        `      const stateKey = '${collectionId}:' + documentId;`,
        `      await fetch('${inboxUrl}', {`,
        `        method: 'POST',`,
        `        headers: { 'Content-Type': 'application/json' },`,
        `        body: JSON.stringify({ stateKey }),`,
        `      });`,
        `    } catch (err: any) {`,
        `      setError(err?.message || 'Submission failed');`,
        `    } finally {`,
        `      setSubmitting(false);`,
        `    }`,
        `  }`,
        ``,
        `  return (`,
        `    <form onSubmit={handleSubmit} className="space-y-4">`,
        `      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">`,
        ...formInputs,
        `      </div>`,
        `      {error && <p className="text-sm text-red-400">{error}</p>}`,
        `      <button`,
        `        type="submit"`,
        `        disabled={submitting}`,
        `        className="px-4 py-2 rounded bg-[#6758c1] hover:bg-[#5344ad] text-sm font-medium disabled:opacity-60"`,
        `      >`,
        `        {submitting ? 'Submitting…' : 'Submit'}`,
        `      </button>`,
        `    </form>`,
        `  );`,
        `}`,
      ].join('\n');
    }
  }

  res.json({ workflow, integrationSnippet });
};

export const deleteWorkflowHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  await deleteWorkflow(req.params.workflowId, user.organization.toString());
  res.status(HttpStatus.NO_CONTENT).send();
};
