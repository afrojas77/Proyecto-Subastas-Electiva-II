import type { PaymentEvent } from '../entities/payment-event';

export interface PaymentEventRepository {
  existsById(id: string): Promise<boolean>;
  save(paymentEvent: PaymentEvent): Promise<void>;
}
