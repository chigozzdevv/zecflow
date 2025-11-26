import { ConnectorModel, ConnectorDocument } from './connectors.model';
import { getConnectorDefinition } from './connectors.registry';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';
import {
  encryptConnectorConfig,
  maskConnectorConfig,
  decryptConnectorConfig,
} from './connectors.security';
import { BlockModel } from '@/features/blocks/blocks.model';
import { TriggerModel } from '@/features/triggers/triggers.model';

interface CreateConnectorInput {
  name: string;
  type: string;
  config: Record<string, unknown>;
  organizationId: string;
  userId: string;
}

interface DeleteConnectorInput {
  connectorId: string;
  organizationId: string;
}

export const createConnector = async (input: CreateConnectorInput) => {
  const definition = getConnectorDefinition(input.type);
  if (!definition) {
    throw new AppError('Unknown connector type', HttpStatus.BAD_REQUEST);
  }

  const parsedConfig = definition.configSchema.parse(input.config) as Record<string, unknown>;
  const securedConfig = encryptConnectorConfig(input.type, parsedConfig);

  const connector = await ConnectorModel.create({
    name: input.name,
    type: input.type,
    config: securedConfig,
    organization: input.organizationId,
    createdBy: input.userId,
  });

  return formatConnector(connector);
};

export const listConnectors = (organizationId: string) => {
  return ConnectorModel.find({ organization: organizationId })
    .lean()
    .then((connectors) => connectors.map((connector) => maskConnectorLean(connector)));
};

const formatConnector = (connector: ConnectorDocument) => {
  return {
    ...connector.toObject(),
    config: maskConnectorConfig(connector.type, connector.config as Record<string, unknown>),
  };
};

const maskConnectorLean = (connector: any) => ({
  ...connector,
  config: maskConnectorConfig(connector.type, connector.config as Record<string, unknown>),
});

export const decryptConnector = (connector: ConnectorDocument | any) => {
  return {
    ...connector,
    config: decryptConnectorConfig(connector.type, connector.config as Record<string, unknown>),
  };
};

export const deleteConnector = async (input: DeleteConnectorInput): Promise<void> => {
  const connector = await ConnectorModel.findById(input.connectorId);
  if (!connector || connector.organization.toString() !== input.organizationId) {
    throw new AppError('Connector not found', HttpStatus.NOT_FOUND);
  }

  const blockUsage = await BlockModel.countDocuments({ connector: connector._id });
  if (blockUsage > 0) {
    throw new AppError('Connector is referenced by blocks', HttpStatus.BAD_REQUEST);
  }

  await connector.deleteOne();
};
