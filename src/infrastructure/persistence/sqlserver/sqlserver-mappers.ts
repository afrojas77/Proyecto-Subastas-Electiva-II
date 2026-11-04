import { Auction } from '../../../domain/entities/auction';
import { Bid } from '../../../domain/entities/bid';
import { PaymentEvent } from '../../../domain/entities/payment-event';
import {
  PaymentOrder,
  type PaymentOrderStatus,
} from '../../../domain/entities/payment-order';
import {
  RejectedBidAttempt,
  RejectedBidReason,
} from '../../../domain/entities/rejected-bid-attempt';
import { User } from '../../../domain/entities/user';
import type { ProcessedPaymentEvent } from '../../../domain/ports/payment-event.repository';
import { Article, type ConservationState } from '../../../domain/value-objects/article';
import { AuctionStatus } from '../../../domain/value-objects/auction-status';
import { Category } from '../../../domain/value-objects/category';
import { Email } from '../../../domain/value-objects/email';
import { Money } from '../../../domain/value-objects/money';

type SqlBigInt = number | string;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
}

export interface PaymentOrderRow {
  id: string;
  auction_id: string;
  debtor_id: string;
  amount: SqlBigInt;
  created_at: Date;
  due_at: Date;
  status: string;
}

export interface PaymentEventRow {
  id: string;
  payment_order_id: string;
  result: string;
  occurred_at: Date;
  origin_verification_data: string;
  content_key: string;
  response_event_id: string;
  response_payment_order_id: string;
  response_result: string;
  response_order_status: string;
}

export interface AuctionRow {
  id: string;
  seller_id: string;
  article_denomination: string;
  article_description: string;
  article_conservation_state: string;
  category_name: string;
  base_price: SqlBigInt;
  minimum_increment: SqlBigInt;
  published_at: Date;
  closes_at: Date;
  status: string;
  version: SqlBigInt;
  closure_id: string | null;
  winning_bid_id: string | null;
}

export interface AcceptedBidRow {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: SqlBigInt;
  placed_at: Date;
  sequence: number;
}

export interface RejectedBidAttemptRow {
  id: string;
  auction_id: string;
  bidder_id: string;
  attempted_amount: SqlBigInt;
  attempted_at: Date;
  reason: string;
  attempt_order: number;
}

export function restoreUser(row: UserRow): User {
  return new User(
    row.id,
    new Email(row.email),
    row.password_hash ?? undefined,
  );
}

export function restorePaymentOrder(row: PaymentOrderRow): PaymentOrder {
  return PaymentOrder.restore({
    id: row.id,
    auctionId: row.auction_id,
    debtorId: row.debtor_id,
    amount: new Money(toNumber(row.amount)),
    createdAt: row.created_at,
    dueAt: row.due_at,
    status: row.status as PaymentOrderStatus,
  });
}

export function restoreProcessedPaymentEvent(
  row: PaymentEventRow,
): ProcessedPaymentEvent {
  const event = new PaymentEvent(
    row.id,
    row.payment_order_id,
    row.result as PaymentEvent['result'],
    row.occurred_at,
    row.origin_verification_data,
  );
  return {
    event,
    contentKey: row.content_key,
    response: Object.freeze({
      eventId: row.response_event_id,
      paymentOrderId: row.response_payment_order_id,
      result: row.response_result as PaymentEvent['result'],
      orderStatus: row.response_order_status as PaymentOrderStatus,
    }),
  };
}

export function restoreAuction(
  row: AuctionRow,
  bidRows: readonly AcceptedBidRow[],
  rejectedRows: readonly RejectedBidAttemptRow[],
  paymentOrderRow?: PaymentOrderRow,
): Auction {
  const acceptedBids = bidRows.map(
    (bid) =>
      new Bid(
        bid.id,
        bid.auction_id,
        bid.bidder_id,
        new Money(toNumber(bid.amount)),
        bid.placed_at,
        bid.sequence,
      ),
  );
  const rejectedBidAttempts = rejectedRows.map(
    (attempt) =>
      new RejectedBidAttempt(
        attempt.id,
        attempt.auction_id,
        attempt.bidder_id,
        new Money(toNumber(attempt.attempted_amount)),
        attempt.attempted_at,
        attempt.reason as RejectedBidReason,
      ),
  );
  const closure = row.closure_id
    ? {
        winningBidId: row.winning_bid_id ?? undefined,
        paymentOrder: paymentOrderRow
          ? restorePaymentOrder(paymentOrderRow)
          : undefined,
      }
    : undefined;

  return Auction.restore({
    id: row.id,
    sellerId: row.seller_id,
    article: new Article(
      row.article_denomination,
      row.article_description,
      row.article_conservation_state as ConservationState,
    ),
    category: new Category(row.category_name),
    basePrice: new Money(toNumber(row.base_price)),
    minimumIncrement: new Money(toNumber(row.minimum_increment)),
    publishedAt: row.published_at,
    closesAt: row.closes_at,
    status: AuctionStatus.from(row.status),
    acceptedBids,
    rejectedBidAttempts,
    closure,
  });
}

function toNumber(value: SqlBigInt): number {
  return typeof value === 'number' ? value : Number(value);
}
