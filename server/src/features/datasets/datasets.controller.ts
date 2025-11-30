import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/auth/auth.service';
import { createDataset, listDatasets, getDataset, updateDataset, deprecateDataset } from './datasets.service';

export const createDatasetHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const ds = await createDataset(user.organization.toString(), req.body.name, req.body.schema);
  res.status(HttpStatus.CREATED).json({ dataset: ds });
};

export const listDatasetsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const datasets = await listDatasets(user.organization.toString());
  res.json({ datasets });
};

export const getDatasetHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const ds = await getDataset(user.organization.toString(), req.params.datasetId);
  if (!ds) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Dataset not found' });
    return;
  }
  res.json({ dataset: ds });
};

export const updateDatasetHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const ds = await updateDataset(user.organization.toString(), req.params.datasetId, {
    name: req.body.name,
    schema: req.body.schema,
  });
  if (!ds) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Dataset not found' });
    return;
  }
  res.json({ dataset: ds });
};

export const deprecateDatasetHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const ds = await deprecateDataset(user.organization.toString(), req.params.datasetId);
  if (!ds) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Dataset not found' });
    return;
  }
  res.json({ dataset: ds });
};
