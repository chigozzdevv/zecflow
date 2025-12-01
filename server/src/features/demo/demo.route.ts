import { Router } from 'express';
import {
  demoLoanHandler,
  demoMedicalHandler,
  demoLoanInboxHandler,
  demoLoanWorkflowHandler,
  demoMedicalWorkflowHandler,
  demoLoanResultHandler,
  demoDelegationHandler,
  demoRunStatusHandler,
} from './demo.controller';

const router = Router();

router.post('/loan-app', demoLoanHandler);
router.post('/medicals', demoMedicalHandler);
router.get('/loan-inbox', demoLoanInboxHandler);
router.get('/loan-workflow', demoLoanWorkflowHandler);
router.get('/medical-workflow', demoMedicalWorkflowHandler);
router.post('/loan-result', demoLoanResultHandler);
router.post('/delegation', demoDelegationHandler);
router.get('/run-status/:runId', demoRunStatusHandler);

export default router;
