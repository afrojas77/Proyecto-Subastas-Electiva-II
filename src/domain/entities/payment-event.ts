import { copyValidDate, requireNonEmpty } from '../internal/validation';

export type PaymentEventResult = 'APPROVED' | 'REJECTED';

export class PaymentEvent {
  public readonly id: string;
  public readonly paymentOrderId: string;
  readonly #occurredAt: Date;
  public readonly originVerificationData: string;

  constructor(
    id: string,
    paymentOrderId: string,
    public readonly result: PaymentEventResult,
    occurredAt: Date,
    originVerificationData: string,
  ) {
    this.id = requireNonEmpty(id, 'El identificador del evento de pago');
    this.paymentOrderId = requireNonEmpty(
      paymentOrderId,
      'El identificador de la orden de pago',
    );
    this.#occurredAt = copyValidDate(occurredAt, 'La fecha del evento de pago');
    this.originVerificationData = requireNonEmpty(
      originVerificationData,
      'La información para verificar el origen',
    );
    Object.freeze(this);
  }

  get occurredAt(): Date {
    return new Date(this.#occurredAt.getTime());
  }
}
