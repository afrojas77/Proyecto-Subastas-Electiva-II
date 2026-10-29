import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';
import { InvalidPaymentOrderStateError } from '../errors/invalid-payment-order-state.error';
import { copyValidDate, requireNonEmpty } from '../internal/validation';
import type { Money } from '../value-objects/money';
import type { PaymentEvent } from './payment-event';

const PAYMENT_WINDOW_IN_MILLISECONDS = 48 * 60 * 60 * 1000;

export type PaymentOrderStatus = 'PENDING' | 'PAID' | 'EXPIRED';

export interface PaymentOrderSnapshot {
  id: string;
  auctionId: string;
  debtorId: string;
  amount: Money;
  createdAt: Date;
  dueAt: Date;
  status: PaymentOrderStatus;
}

export class PaymentOrder {
  public readonly id: string;
  public readonly auctionId: string;
  public readonly debtorId: string;
  readonly #createdAt: Date;
  readonly #dueAt: Date;
  #status: PaymentOrderStatus = 'PENDING';

  private constructor(
    id: string,
    auctionId: string,
    debtorId: string,
    public readonly amount: Money,
    createdAt: Date,
    dueAt: Date,
    status: PaymentOrderStatus,
  ) {
    this.id = requireNonEmpty(id, 'El identificador de la orden de pago');
    this.auctionId = requireNonEmpty(
      auctionId,
      'El identificador de la subasta',
    );
    this.debtorId = requireNonEmpty(debtorId, 'El identificador del deudor');
    this.#createdAt = copyValidDate(
      createdAt,
      'La fecha de creación de la orden',
    );
    this.#dueAt = copyValidDate(dueAt, 'La fecha de vencimiento de la orden');
    if (this.#dueAt.getTime() < this.#createdAt.getTime()) {
      throw new InvalidDomainValueError(
        'La fecha de vencimiento no puede ser anterior a la creación de la orden.',
      );
    }
    if (!['PENDING', 'PAID', 'EXPIRED'].includes(status)) {
      throw new InvalidDomainValueError(`Estado de orden no válido: ${status}`);
    }
    this.#status = status;
    Object.freeze(this);
  }

  get createdAt(): Date {
    return new Date(this.#createdAt.getTime());
  }

  get dueAt(): Date {
    return new Date(this.#dueAt.getTime());
  }

  get status(): PaymentOrderStatus {
    return this.#status;
  }

  static create(
    id: string,
    auctionId: string,
    debtorId: string,
    amount: Money,
    createdAt: Date,
  ): PaymentOrder {
    return new PaymentOrder(
      id,
      auctionId,
      debtorId,
      amount,
      createdAt,
      new Date(createdAt.getTime() + PAYMENT_WINDOW_IN_MILLISECONDS),
      'PENDING',
    );
  }

  static restore(snapshot: PaymentOrderSnapshot): PaymentOrder {
    return new PaymentOrder(
      snapshot.id,
      snapshot.auctionId,
      snapshot.debtorId,
      snapshot.amount,
      snapshot.createdAt,
      snapshot.dueAt,
      snapshot.status,
    );
  }

  /**
   * La capa de aplicación debe verificar criptográficamente el origen antes de
   * invocar esta operación. La presencia de originVerificationData no prueba
   * por sí sola que el evento sea confiable.
   */
  confirmWithVerifiedEvent(paymentEvent: PaymentEvent): void {
    if (this.#status !== 'PENDING') {
      throw new InvalidPaymentOrderStateError(
        'Solo una orden pendiente puede confirmarse.',
      );
    }
    if (paymentEvent.paymentOrderId !== this.id) {
      throw new InvalidPaymentOrderStateError(
        'El evento de pago no corresponde a esta orden.',
      );
    }
    if (paymentEvent.result !== 'APPROVED') {
      throw new InvalidPaymentOrderStateError(
        'Un evento rechazado no puede confirmar una orden de pago.',
      );
    }

    this.#status = 'PAID';
  }

  expire(evaluatedAt: Date): void {
    if (this.#status !== 'PENDING') {
      throw new InvalidPaymentOrderStateError(
        'Solo una orden pendiente puede vencer.',
      );
    }

    const expirationEvaluation = copyValidDate(
      evaluatedAt,
      'La fecha de evaluación del vencimiento',
    );
    if (expirationEvaluation.getTime() < this.#dueAt.getTime()) {
      throw new InvalidPaymentOrderStateError(
        'La orden no puede vencer antes de su fecha límite.',
      );
    }

    this.#status = 'EXPIRED';
  }
}
