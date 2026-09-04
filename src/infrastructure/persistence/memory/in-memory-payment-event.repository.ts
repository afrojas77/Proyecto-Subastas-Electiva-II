import type { PaymentEvent } from '../../../domain/entities/payment-event';
import type { PaymentEventRepository } from '../../../domain/ports/payment-event.repository';

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly paymentEvents = new Map<string, PaymentEvent>();

  existsById(id: string): Promise<boolean> {
    return Promise.resolve(this.paymentEvents.has(id));
  }

  save(paymentEvent: PaymentEvent): Promise<void> {
    this.paymentEvents.set(paymentEvent.id, paymentEvent);
    return Promise.resolve();
  }
}
