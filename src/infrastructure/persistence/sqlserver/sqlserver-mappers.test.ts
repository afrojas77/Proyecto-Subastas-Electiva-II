import { describe, expect, it } from '@jest/globals';

import { AuctionStatus } from '../../../domain/value-objects/auction-status';
import {
  restoreAuction,
  restorePaymentOrder,
  restoreProcessedPaymentEvent,
  restoreUser,
  type AcceptedBidRow,
  type AuctionRow,
  type PaymentEventRow,
  type PaymentOrderRow,
  type RejectedBidAttemptRow,
} from './sqlserver-mappers';

const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOSES_AT = new Date('2026-01-01T13:00:00.000Z');
const DUE_AT = new Date('2026-01-03T13:00:00.000Z');

const orderRow: PaymentOrderRow = {
  id: 'payment-1',
  auction_id: 'auction-1',
  debtor_id: 'bidder-2',
  amount: '120000',
  created_at: CLOSES_AT,
  due_at: DUE_AT,
  status: 'PENDING',
};

describe('mapeadores SQL Server', () => {
  it('restaura una subasta adjudicada con pujas, rechazos y cierre', () => {
    const auctionRow: AuctionRow = {
      id: 'auction-1',
      seller_id: 'seller-1',
      article_denomination: 'Reloj',
      article_description: 'Reloj mecánico',
      article_conservation_state: 'USED',
      category_name: 'Coleccionables',
      base_price: '100000',
      minimum_increment: 10_000,
      published_at: PUBLISHED_AT,
      closes_at: CLOSES_AT,
      status: 'CLOSED',
      version: 0,
      closure_id: 'auction-1',
      winning_bid_id: 'bid-2',
    };
    const bids: AcceptedBidRow[] = [
      {
        id: 'bid-1',
        auction_id: 'auction-1',
        bidder_id: 'bidder-1',
        amount: 100_000,
        placed_at: new Date('2026-01-01T12:15:00.000Z'),
        sequence: 1,
      },
      {
        id: 'bid-2',
        auction_id: 'auction-1',
        bidder_id: 'bidder-2',
        amount: '120000',
        placed_at: new Date('2026-01-01T12:30:00.000Z'),
        sequence: 2,
      },
    ];
    const rejected: RejectedBidAttemptRow[] = [
      {
        id: 'rejected-1',
        auction_id: 'auction-1',
        bidder_id: 'bidder-3',
        attempted_amount: 105_000,
        attempted_at: new Date('2026-01-01T12:20:00.000Z'),
        reason: 'BID_INCREMENT_TOO_LOW',
        attempt_order: 1,
      },
    ];

    const auction = restoreAuction(auctionRow, bids, rejected, orderRow);

    expect(auction.status).toBe(AuctionStatus.CLOSED);
    expect(auction.acceptedBids.map((bid) => bid.sequence)).toEqual([1, 2]);
    expect(auction.highestBid?.amount.amount).toBe(120_000);
    expect(auction.rejectedBidAttempts[0]?.reason).toBe(
      'BID_INCREMENT_TOO_LOW',
    );
    expect(auction.closure?.winnerId).toBe('bidder-2');
    expect(auction.closure?.paymentOrder?.id).toBe('payment-1');
    expect(auction.closure?.paymentOrder?.dueAt).toEqual(DUE_AT);
  });

  it('restaura órdenes, eventos procesados y usuarios normalizados', () => {
    const eventRow: PaymentEventRow = {
      id: 'event-1',
      payment_order_id: 'payment-1',
      result: 'APPROVED',
      occurred_at: new Date('2026-01-01T14:00:00.000Z'),
      origin_verification_data: 'verified-test-origin',
      content_key: '["event-1"]',
      response_event_id: 'event-1',
      response_payment_order_id: 'payment-1',
      response_result: 'APPROVED',
      response_order_status: 'PAID',
    };

    const order = restorePaymentOrder(orderRow);
    const processedEvent = restoreProcessedPaymentEvent(eventRow);
    const user = restoreUser({
      id: 'user-1',
      name: 'Andrea Rojas',
      email: 'USER@EXAMPLE.COM',
      password_hash: 'stored-hash',
    });

    expect(order.amount.amount).toBe(120_000);
    expect(order.createdAt).toEqual(CLOSES_AT);
    expect(processedEvent.event.occurredAt).toEqual(eventRow.occurred_at);
    expect(processedEvent.response).toEqual({
      eventId: 'event-1',
      paymentOrderId: 'payment-1',
      result: 'APPROVED',
      orderStatus: 'PAID',
    });
    expect(user.email.value).toBe('user@example.com');
    expect(user.name).toBe('Andrea Rojas');
    expect(user.passwordHash).toBe('stored-hash');
  });
});
