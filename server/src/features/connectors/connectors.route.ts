import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import {
  createConnectorHandler,
  listConnectorsHandler,
  listConnectorDefinitions,
  deleteConnectorHandler,
} from './connectors.controller';
import { createConnectorSchema, deleteConnectorSchema } from './connectors.schema';

const router = Router();

router.get('/definitions', authenticate, listConnectorDefinitions);
router.get('/', authenticate, listConnectorsHandler);
router.post('/', authenticate, validate(createConnectorSchema), createConnectorHandler);
router.delete('/:id', authenticate, validate(deleteConnectorSchema), deleteConnectorHandler);

export default router;
