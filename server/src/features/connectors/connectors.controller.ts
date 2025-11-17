import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/users/users.service';
import { createConnector, listConnectors } from './connectors.service';
import { connectorRegistry } from './connectors.registry';

export const createConnectorHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const connector = await createConnector({
    name: req.body.name,
    type: req.body.type,
    config: req.body.config ?? {},
    organizationId: user.organization.toString(),
    userId: user.id,
  });

  res.status(HttpStatus.CREATED).json({ connector });
};

export const listConnectorsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const connectors = await listConnectors(user.organization.toString());
  res.json({ connectors });
};

export const listConnectorDefinitions = (_req: AuthenticatedRequest, res: Response): void => {
  res.json({ connectors: connectorRegistry });
};
