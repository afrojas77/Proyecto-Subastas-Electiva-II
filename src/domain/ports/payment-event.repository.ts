import type { PaymentEvent } from '../entities/payment-event';
import type { PaymentOrderStatus } from '../entities/payment-order';

export interface PaymentProcessingResponse {
  eventId: string;
  paymentOrderId: string;
  result: PaymentEvent['result'];
  orderStatus: PaymentOrderStatus;
}

export interface ProcessedPaymentEvent {
  event: PaymentEvent;
  contentKey: string;
  response: PaymentProcessingResponse;
}

export interface PaymentEventRepository {
  findById(id: string): Promise<ProcessedPaymentEvent | undefined>;
  save(processedEvent: ProcessedPaymentEvent): Promise<void>;
}
