import { encryptValue, decryptValue, maskValue } from '@/shared/services/encryption.service';
import { ConnectorDefinition, getConnectorDefinition } from './connectors.registry';

const SECRET_PREFIX = 'enc:';

const secureFieldsFor = (definition: ConnectorDefinition | undefined): string[] => definition?.secureFields ?? [];

export const encryptConnectorConfig = (
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const definition = getConnectorDefinition(type);
  const secureFields = secureFieldsFor(definition);
  const clone: Record<string, unknown> = { ...config };
  secureFields.forEach((field) => {
    const value = clone[field];
    if (typeof value === 'string' && !value.startsWith(SECRET_PREFIX)) {
      clone[field] = encryptValue(value);
    }
  });
  return clone;
};

export const decryptConnectorConfig = (
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const definition = getConnectorDefinition(type);
  const secureFields = secureFieldsFor(definition);
  const clone: Record<string, unknown> = { ...config };
  secureFields.forEach((field) => {
    const value = clone[field];
    if (typeof value === 'string' && value.startsWith(SECRET_PREFIX)) {
      clone[field] = decryptValue(value);
    }
  });
  return clone;
};

export const maskConnectorConfig = (
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const definition = getConnectorDefinition(type);
  const secureFields = secureFieldsFor(definition);
  const clone: Record<string, unknown> = { ...config };
  secureFields.forEach((field) => {
    const value = clone[field];
    if (typeof value === 'string') {
      clone[field] = maskValue(value);
    }
  });
  return clone;
};
