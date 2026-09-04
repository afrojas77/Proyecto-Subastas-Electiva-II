import type { Bid } from '../entities/bid';
import type { PaymentOrder } from '../entities/payment-order';
import type { AuctionStatus } from './auction-status';

export class AuctionClosure {
  constructor(
    public readonly auctionId: string,
    public readonly status: AuctionStatus,
    public readonly winningBid?: Bid,
    public readonly paymentOrder?: PaymentOrder,
  ) {
    Object.freeze(this);
  }

  get winnerId(): string | undefined {
    return this.winningBid?.bidderId;
  }
}
