import { BidRejectedError } from '../errors/bid-rejected.error';
import { InvalidAuctionError } from '../errors/invalid-auction.error';
import { InvalidAuctionStateError } from '../errors/invalid-auction-state.error';
import { copyValidDate, requireNonEmpty } from '../internal/validation';
import type { Clock } from '../ports/clock';
import type { Article } from '../value-objects/article';
import { AuctionClosure } from '../value-objects/auction-closure';
import { AuctionStatus } from '../value-objects/auction-status';
import type { Category } from '../value-objects/category';
import type { Money } from '../value-objects/money';
import { Bid } from './bid';
import { PaymentOrder } from './payment-order';
import { RejectedBidAttempt, RejectedBidReason } from './rejected-bid-attempt';

const MINIMUM_DURATION_IN_MILLISECONDS = 60 * 60 * 1000;
const MAXIMUM_DURATION_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export interface PublishAuctionData {
  id: string;
  sellerId: string;
  article: Article;
  category: Category;
  basePrice: Money;
  minimumIncrement: Money;
  closesAt: Date;
}

export interface ReceiveBidData {
  id: string;
  bidderId: string;
  amount: Money;
  placedAt: Date;
}

export interface CloseAuctionData {
  closedAt: Date;
  paymentOrderId: string;
}

export class Auction {
  readonly #id: string;
  readonly #sellerId: string;
  readonly #article: Article;
  readonly #category: Category;
  readonly #basePrice: Money;
  readonly #minimumIncrement: Money;
  readonly #publishedAt: Date;
  readonly #closesAt: Date;
  #status = AuctionStatus.OPEN;
  readonly #acceptedBids: Bid[] = [];
  readonly #rejectedBidAttempts: RejectedBidAttempt[] = [];
  #closure?: AuctionClosure;

  private constructor(data: PublishAuctionData, publishedAt: Date) {
    this.#id = requireNonEmpty(data.id, 'El identificador de la subasta');
    this.#sellerId = requireNonEmpty(
      data.sellerId,
      'El identificador del vendedor',
    );
    this.#article = data.article;
    this.#category = data.category;
    this.#basePrice = data.basePrice;
    this.#minimumIncrement = data.minimumIncrement;
    this.#publishedAt = copyValidDate(publishedAt, 'La fecha de publicación');
    this.#closesAt = copyValidDate(data.closesAt, 'La fecha de cierre');
  }

  static publish(data: PublishAuctionData, clock: Clock): Auction {
    if (!data.basePrice.isPositive()) {
      throw new InvalidAuctionError('El precio base debe ser mayor que cero.');
    }
    if (!data.minimumIncrement.isPositive()) {
      throw new InvalidAuctionError(
        'El incremento mínimo debe ser mayor que cero.',
      );
    }

    const publishedAt = copyValidDate(clock.now(), 'La fecha de publicación');
    const closesAt = copyValidDate(data.closesAt, 'La fecha de cierre');
    const duration = closesAt.getTime() - publishedAt.getTime();

    if (duration <= 0) {
      throw new InvalidAuctionError(
        'La fecha de cierre debe ser posterior a la publicación.',
      );
    }
    if (duration < MINIMUM_DURATION_IN_MILLISECONDS) {
      throw new InvalidAuctionError(
        'La subasta debe durar como mínimo una hora.',
      );
    }
    if (duration > MAXIMUM_DURATION_IN_MILLISECONDS) {
      throw new InvalidAuctionError(
        'La subasta no puede durar más de treinta días.',
      );
    }

    return new Auction(data, publishedAt);
  }

  get id(): string {
    return this.#id;
  }

  get sellerId(): string {
    return this.#sellerId;
  }

  get article(): Article {
    return this.#article;
  }

  get category(): Category {
    return this.#category;
  }

  get basePrice(): Money {
    return this.#basePrice;
  }

  get minimumIncrement(): Money {
    return this.#minimumIncrement;
  }

  get publishedAt(): Date {
    return new Date(this.#publishedAt.getTime());
  }

  get closesAt(): Date {
    return new Date(this.#closesAt.getTime());
  }

  get status(): AuctionStatus {
    return this.#status;
  }

  get acceptedBids(): readonly Bid[] {
    return [...this.#acceptedBids];
  }

  get rejectedBidAttempts(): readonly RejectedBidAttempt[] {
    return [...this.#rejectedBidAttempts];
  }

  get highestBid(): Bid | undefined {
    return this.#acceptedBids.at(-1);
  }

  get winnerId(): string | undefined {
    return this.#closure?.winnerId;
  }

  get closure(): AuctionClosure | undefined {
    return this.#closure;
  }

  cancel(): void {
    if (!this.#status.equals(AuctionStatus.OPEN)) {
      throw new InvalidAuctionStateError(
        'Solo una subasta abierta puede cancelarse.',
      );
    }
    if (this.#acceptedBids.length > 0) {
      throw new InvalidAuctionStateError(
        'Una subasta que ya recibió una puja no puede cancelarse.',
      );
    }
    this.#status = AuctionStatus.CANCELLED;
  }

  receiveBid(data: ReceiveBidData): Bid {
    const placedAt = copyValidDate(data.placedAt, 'La fecha de la puja');
    const bidderId = requireNonEmpty(
      data.bidderId,
      'El identificador del postor',
    );

    if (
      !this.#status.equals(AuctionStatus.OPEN) ||
      placedAt.getTime() >= this.#closesAt.getTime()
    ) {
      return this.rejectBid(
        data,
        bidderId,
        placedAt,
        RejectedBidReason.AUCTION_NOT_OPEN,
      );
    }
    if (bidderId === this.#sellerId) {
      return this.rejectBid(
        data,
        bidderId,
        placedAt,
        RejectedBidReason.SELLER_CANNOT_BID,
      );
    }

    const currentHighestBid = this.highestBid;
    if (
      !currentHighestBid &&
      !data.amount.isGreaterThanOrEqualTo(this.#basePrice)
    ) {
      return this.rejectBid(
        data,
        bidderId,
        placedAt,
        RejectedBidReason.BID_BELOW_BASE_PRICE,
      );
    }
    if (currentHighestBid?.bidderId === bidderId) {
      return this.rejectBid(
        data,
        bidderId,
        placedAt,
        RejectedBidReason.BIDDER_ALREADY_LEADING,
      );
    }
    if (
      currentHighestBid &&
      !data.amount.isGreaterThanOrEqualTo(
        currentHighestBid.amount.add(this.#minimumIncrement),
      )
    ) {
      return this.rejectBid(
        data,
        bidderId,
        placedAt,
        RejectedBidReason.BID_INCREMENT_TOO_LOW,
      );
    }

    const bid = new Bid(
      data.id,
      this.#id,
      bidderId,
      data.amount,
      placedAt,
      this.#acceptedBids.length + 1,
    );
    this.#acceptedBids.push(bid);
    return bid;
  }

  close(data: CloseAuctionData): AuctionClosure {
    if (this.#closure) {
      return this.#closure;
    }
    if (!this.#status.equals(AuctionStatus.OPEN)) {
      throw new InvalidAuctionStateError(
        'Solo una subasta abierta puede cerrarse.',
      );
    }

    const closedAt = copyValidDate(
      data.closedAt,
      'La fecha efectiva de cierre',
    );
    if (closedAt.getTime() < this.#closesAt.getTime()) {
      throw new InvalidAuctionStateError(
        'La subasta no puede cerrarse antes de su fecha de cierre.',
      );
    }

    const winningBid = this.highestBid;
    if (!winningBid) {
      this.#status = AuctionStatus.DESERTED;
      this.#closure = new AuctionClosure(this.#id, this.#status);
      return this.#closure;
    }

    this.#status = AuctionStatus.CLOSED;
    const paymentOrder = PaymentOrder.create(
      data.paymentOrderId,
      this.#id,
      winningBid.bidderId,
      winningBid.amount,
      closedAt,
    );
    this.#closure = new AuctionClosure(
      this.#id,
      this.#status,
      winningBid,
      paymentOrder,
    );
    return this.#closure;
  }

  private rejectBid(
    data: ReceiveBidData,
    bidderId: string,
    attemptedAt: Date,
    reason: RejectedBidReason,
  ): never {
    this.#rejectedBidAttempts.push(
      new RejectedBidAttempt(
        `${this.#id}-rejected-${this.#rejectedBidAttempts.length + 1}`,
        this.#id,
        bidderId,
        data.amount,
        attemptedAt,
        reason,
      ),
    );
    throw new BidRejectedError(reason);
  }
}
