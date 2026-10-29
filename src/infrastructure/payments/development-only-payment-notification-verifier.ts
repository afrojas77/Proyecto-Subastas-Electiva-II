import { timingSafeEqual } from 'node:crypto';

import type {
  PaymentNotificationVerificationRequest,
  PaymentNotificationVerificationResult,
  PaymentNotificationVerifier,
} from '../../application/ports/payment-notification-verifier';

/** Simulación local. No sustituye la verificación de una pasarela real. */
export class DevelopmentOnlyPaymentNotificationVerifier
  implements PaymentNotificationVerifier
{
  constructor(private readonly expectedSecret: string) {
    if (!expectedSecret) {
      throw new Error('El secreto simulado de webhook es obligatorio.');
    }
  }

  verify(
    request: PaymentNotificationVerificationRequest,
  ): Promise<PaymentNotificationVerificationResult> {
    if (!request.credential) {
      return Promise.resolve({ verified: false });
    }

    const expected = Buffer.from(this.expectedSecret);
    const received = Buffer.from(request.credential);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return Promise.resolve({ verified: false });
    }

    return Promise.resolve({
      verified: true,
      verificationData: 'DEVELOPMENT_ONLY_SHARED_SECRET_MATCH',
    });
  }
}
