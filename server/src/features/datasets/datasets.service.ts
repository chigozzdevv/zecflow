import { DatasetModel } from './datasets.model';
import { createId } from '@/utils/crypto';
import { nildbService } from '@/features/nillion-compute/nildb.service';

export const createDataset = async (organizationId: string, name: string, schema: any) => {
  const collectionId = createId();
  await nildbService.ensureCollection(collectionId, schema || {});
  return DatasetModel.create({ organization: organizationId, name, schema, nildbCollectionId: collectionId });
};

export const listDatasets = (organizationId: string) => {
  return DatasetModel.find({ organization: organizationId }).sort({ createdAt: -1 }).lean();
};

export const getDataset = async (organizationId: string, datasetId: string) => {
  const ds = await DatasetModel.findById(datasetId).lean();
  if (!ds || ds.organization.toString() !== organizationId) return null;
  return ds;
};

export const updateDataset = async (
  organizationId: string,
  datasetId: string,
  updates: { name?: string; schema?: any },
) => {
  const ds = await DatasetModel.findById(datasetId);
  if (!ds || ds.organization.toString() !== organizationId) return null;
  if (typeof updates.name === 'string') ds.name = updates.name;
  if (Object.prototype.hasOwnProperty.call(updates, 'schema')) ds.schema = updates.schema;
  await ds.save();
  return ds.toObject();
};

export const deprecateDataset = async (organizationId: string, datasetId: string) => {
  const ds = await DatasetModel.findById(datasetId);
  if (!ds || ds.organization.toString() !== organizationId) return null;
  ds.status = 'deprecated';
  await ds.save();
  return ds.toObject();
};
