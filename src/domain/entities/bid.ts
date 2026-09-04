import { copyValidDate, requireNonEmpty } from '../internal/validation';
import type { Money } from '../value-objects/money';

export class Bid {
  public readonly id: string;
  public readonly auctionId: string;
  public readonly bidderId: string;
  readonly #placedAt: Date;

  constructor(
    id: string,
    auctionId: string,
    bidderId: string,
    public readonly amount: Money,
    placedAt: Date,
    public readonly sequence: number,
  ) {
    this.id = requireNonEmpty(id, 'El identificador de la puja');
    this.auctionId = requireNonEmpty(
      auctionId,
      'El identificador de la subasta',
    );
    this.bidderId = requireNonEmpty(bidderId, 'El identificador del postor');
    this.#placedAt = copyValidDate(placedAt, 'La fecha de la puja');
    Object.freeze(this);
  }

  get placedAt(): Date {
    return new Date(this.#placedAt.getTime());
  }
}
