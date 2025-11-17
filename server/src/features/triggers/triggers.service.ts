import { TriggerModel } from './triggers.model';
import { getTriggerDefinition } from './triggers.registry';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { registerGithubWebhook } from '@/shared/services/github-webhook.service';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';

interface CreateTriggerInput {
  name: string;
  type: string;
  connectorId?: string;
  config: Record<string, unknown>;
  organizationId: string;
  userId: string;
}

export const createTrigger = async (input: CreateTriggerInput) => {
  const definition = getTriggerDefinition(input.type);
  if (!definition) {
    throw new AppError('Unknown trigger type', HttpStatus.BAD_REQUEST);
  }

  const parsedConfig = definition.configSchema.parse(input.config) as Record<string, any>;

  let connector = null;
  if (input.connectorId) {
    connector = await ConnectorModel.findById(input.connectorId);
    if (!connector) {
      throw new AppError('Connector not found', HttpStatus.NOT_FOUND);
    }
    connector.config = decryptConnectorConfig(connector.type, connector.config as Record<string, unknown>);
  }

  if (definition.id === 'github-commit' && !connector) {
    throw new AppError('GitHub trigger requires connector', HttpStatus.BAD_REQUEST);
  }
  if (definition.id === 'custom-http-poll' && !connector) {
    throw new AppError('Custom HTTP poll trigger requires connector', HttpStatus.BAD_REQUEST);
  }
  if (definition.id === 'zcash-transaction') {
    if (connector && connector.type !== 'zcash-viewkey') {
      throw new AppError('Zcash trigger requires a Zcash viewing key connector', HttpStatus.BAD_REQUEST);
    }
    if (!parsedConfig.address && connector) {
      parsedConfig.address = (connector.config as Record<string, unknown>).address;
    }
    if (!parsedConfig.address) {
      throw new AppError('Zcash trigger requires address', HttpStatus.BAD_REQUEST);
    }
  }

  const trigger = await TriggerModel.create({
    name: input.name,
    type: input.type,
    config: parsedConfig,
    connector: input.connectorId,
    organization: input.organizationId,
    createdBy: input.userId,
    status: 'active',
  });

  if (definition.id === 'github-commit' && connector) {
    await registerGithubWebhook(trigger.id, connector);
  }

  return trigger;
};

export const listTriggers = (organizationId: string) => {
  return TriggerModel.find({ organization: organizationId }).lean();
};
