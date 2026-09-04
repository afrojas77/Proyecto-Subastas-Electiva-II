import { copyValidDate, requireNonEmpty } from '../internal/validation';
import type { Money } from '../value-objects/money';

const PAYMENT_WINDOW_IN_MILLISECONDS = 48 * 60 * 60 * 1000;

export type PaymentOrderStatus = 'PENDING' | 'PAID' | 'EXPIRED';

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
    this.#dueAt = new Date(
      this.#createdAt.getTime() + PAYMENT_WINDOW_IN_MILLISECONDS,
    );
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
    return new PaymentOrder(id, auctionId, debtorId, amount, createdAt);
  }
}
