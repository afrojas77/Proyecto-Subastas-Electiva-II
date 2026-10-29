import { Router } from 'express';

import type { PaymentController } from '../controllers/payment.controller';

export function createPaymentRouter(controller: PaymentController): Router {
  const router = Router();

  router.post('/webhook', controller.webhook);

  return router;
}
