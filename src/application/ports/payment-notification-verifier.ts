export interface PaymentNotificationVerificationRequest {
  payload: unknown;
  credential?: string;
}

export type PaymentNotificationVerificationResult =
  | { verified: false }
  | { verified: true; verificationData: string };

export interface PaymentNotificationVerifier {
  verify(
    request: PaymentNotificationVerificationRequest,
  ): Promise<PaymentNotificationVerificationResult>;
}
