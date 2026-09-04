import type { PaymentOrder } from '../entities/payment-order';

export interface PaymentOrderRepository {
  findById(id: string): Promise<PaymentOrder | undefined>;
  save(paymentOrder: PaymentOrder): Promise<void>;
}
