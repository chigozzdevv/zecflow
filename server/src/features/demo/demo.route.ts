import { Router } from 'express';
import {
  demoLoanHandler,
  demoMedicalHandler,
  demoLoanInboxHandler,
  demoLoanWorkflowHandler,
  demoMedicalWorkflowHandler,
} from './demo.controller';

const router = Router();

router.post('/loan-app', demoLoanHandler);
router.post('/medicals', demoMedicalHandler);
router.get('/loan-inbox', demoLoanInboxHandler);
router.get('/loan-workflow', demoLoanWorkflowHandler);
router.get('/medical-workflow', demoMedicalWorkflowHandler);

export default router;
