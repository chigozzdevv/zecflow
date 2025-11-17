import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { findUserById } from '@/features/users/users.service';
import { listAuditForOrganization } from './audit.service';

export const listAuditHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const auditLogs = await listAuditForOrganization(user.organization.toString(), limit);
  res.json({ audit: auditLogs });
};
