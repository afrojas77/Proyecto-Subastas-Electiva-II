import { copyValidDate, requireNonEmpty } from '../internal/validation';
import type { Money } from '../value-objects/money';

export enum RejectedBidReason {
  AUCTION_NOT_OPEN = 'AUCTION_NOT_OPEN',
  SELLER_CANNOT_BID = 'SELLER_CANNOT_BID',
  BID_BELOW_BASE_PRICE = 'BID_BELOW_BASE_PRICE',
  BID_INCREMENT_TOO_LOW = 'BID_INCREMENT_TOO_LOW',
  BIDDER_ALREADY_LEADING = 'BIDDER_ALREADY_LEADING',
}

export class RejectedBidAttempt {
  public readonly id: string;
  public readonly auctionId: string;
  public readonly bidderId: string;
  readonly #attemptedAt: Date;

  constructor(
    id: string,
    auctionId: string,
    bidderId: string,
    public readonly attemptedAmount: Money,
    attemptedAt: Date,
    public readonly reason: RejectedBidReason,
  ) {
    this.id = requireNonEmpty(id, 'El identificador del intento rechazado');
    this.auctionId = requireNonEmpty(
      auctionId,
      'El identificador de la subasta',
    );
    this.bidderId = requireNonEmpty(bidderId, 'El identificador del postor');
    this.#attemptedAt = copyValidDate(
      attemptedAt,
      'La fecha del intento rechazado',
    );
    Object.freeze(this);
  }

  get attemptedAt(): Date {
    return new Date(this.#attemptedAt.getTime());
  }
}
