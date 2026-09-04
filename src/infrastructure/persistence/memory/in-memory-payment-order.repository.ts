import type { PaymentOrder } from '../../../domain/entities/payment-order';
import type { PaymentOrderRepository } from '../../../domain/ports/payment-order.repository';

export class InMemoryPaymentOrderRepository implements PaymentOrderRepository {
  private readonly paymentOrders = new Map<string, PaymentOrder>();

  findById(id: string): Promise<PaymentOrder | undefined> {
    return Promise.resolve(this.paymentOrders.get(id));
  }

  save(paymentOrder: PaymentOrder): Promise<void> {
    this.paymentOrders.set(paymentOrder.id, paymentOrder);
    return Promise.resolve();
  }
}
