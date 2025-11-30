import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import {
  createDatasetSchema,
  updateDatasetSchema,
  datasetIdParamSchema,
} from './datasets.schema';
import {
  createDatasetHandler,
  listDatasetsHandler,
  getDatasetHandler,
  updateDatasetHandler,
  deprecateDatasetHandler,
} from './datasets.controller';

const router = Router();

router.get('/', authenticate, listDatasetsHandler);
router.post('/', authenticate, validate(createDatasetSchema), createDatasetHandler);
router.get('/:datasetId', authenticate, validate(datasetIdParamSchema), getDatasetHandler);
router.patch('/:datasetId', authenticate, validate(updateDatasetSchema), updateDatasetHandler);
router.post('/:datasetId/deprecate', authenticate, validate(datasetIdParamSchema), deprecateDatasetHandler);

export default router;
