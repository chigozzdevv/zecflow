import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { Response } from 'express';
import { findUserById } from '@/features/users/users.service';
import { registerWorkload, listWorkloads } from './nillion-compute.service';

export const registerWorkloadHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workload = await registerWorkload({
    name: req.body.name,
    workloadId: req.body.workloadId,
    description: req.body.description,
    config: req.body.config ?? {},
    organizationId: user.organization.toString(),
  });
  res.status(HttpStatus.CREATED).json({ workload });
};

export const listWorkloadsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const workloads = await listWorkloads(user.organization.toString());
  res.json({ workloads });
};
