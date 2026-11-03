import { Router, type RequestHandler } from 'express';

import type { PaymentOrderController } from '../controllers/payment-order.controller';

export function createPaymentOrderRouter(
  controller: PaymentOrderController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.get('/:id', authenticate, controller.get);

  return router;
}
