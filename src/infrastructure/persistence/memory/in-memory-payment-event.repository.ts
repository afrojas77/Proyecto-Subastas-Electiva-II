import type {
  PaymentEventRepository,
  ProcessedPaymentEvent,
} from '../../../domain/ports/payment-event.repository';

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly paymentEvents = new Map<string, ProcessedPaymentEvent>();

  findById(id: string): Promise<ProcessedPaymentEvent | undefined> {
    return Promise.resolve(this.paymentEvents.get(id));
  }

  save(processedEvent: ProcessedPaymentEvent): Promise<void> {
    this.paymentEvents.set(processedEvent.event.id, processedEvent);
    return Promise.resolve();
  }
}
