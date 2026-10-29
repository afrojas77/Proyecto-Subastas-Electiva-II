import type { Request, Response } from 'express';

import { ProcessPaymentNotification } from '../../../application/use-cases/process-payment-notification';

export const SIMULATED_PAYMENT_SECRET_HEADER =
  'x-simulated-payment-webhook-secret';

export class PaymentController {
  constructor(
    private readonly processPaymentNotification: ProcessPaymentNotification,
  ) {}

  webhook = async (request: Request, response: Response): Promise<void> => {
    const result = await this.processPaymentNotification.execute({
      payload: request.body as unknown,
      verificationCredential: request.get(SIMULATED_PAYMENT_SECRET_HEADER),
    });
    response.status(200).json(result);
  };
}
