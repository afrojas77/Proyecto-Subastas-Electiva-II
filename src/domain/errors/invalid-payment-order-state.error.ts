import { DomainError } from './domain.error';

export class InvalidPaymentOrderStateError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_PAYMENT_ORDER_STATE');
  }
}
