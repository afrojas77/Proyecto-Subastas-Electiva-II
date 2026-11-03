import type { Request, Response } from 'express';

import type { GetPaymentOrder } from '../../../application/use-cases/get-payment-order';
import { getAuthenticatedUserId } from '../authentication-request';
import { presentPaymentOrder } from '../presenters/payment-order.presenter';
import { requireRouteId } from '../request-helpers';

export class PaymentOrderController {
  constructor(private readonly getPaymentOrder: GetPaymentOrder) {}

  get = async (request: Request, response: Response): Promise<void> => {
    const order = await this.getPaymentOrder.execute({
      paymentOrderId: requireRouteId(request.params.id),
      requesterId: getAuthenticatedUserId(request),
    });
    response.status(200).json(presentPaymentOrder(order));
  };
}
