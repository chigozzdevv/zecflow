import { OrganizationModel, OrganizationDocument } from './organizations.model';
import { slugify } from '@/utils/slug';
import { AppError } from '@/shared/errors/app-error';
import { HttpStatus } from '@/utils/http-status';

export const createOrganization = async (name: string): Promise<OrganizationDocument> => {
  const slug = slugify(name);
  const existing = await OrganizationModel.findOne({ slug });
  if (existing) {
    throw new AppError('Organization name already in use', HttpStatus.CONFLICT);
  }
  return OrganizationModel.create({ name, slug });
};

export const assignOwner = async (organizationId: string, ownerId: string): Promise<void> => {
  await OrganizationModel.findByIdAndUpdate(organizationId, { owner: ownerId });
};

export const getOrganizationById = (id: string): Promise<OrganizationDocument | null> => {
  return OrganizationModel.findById(id);
};
