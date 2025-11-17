import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { getOrganizationById } from './organizations.service';
import { findUserById } from '@/features/auth/auth.service';

export const getOrganization = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }

  const organization = await getOrganizationById(user.organization.toString());
  if (!organization) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'Organization not found' });
    return;
  }

  res.json({
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      owner: organization.owner?.toString() ?? null,
    },
  });
};
