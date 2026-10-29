import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { InvalidAuctionError } from '../errors/invalid-auction.error';
import { Article } from '../value-objects/article';
import { AuctionStatus } from '../value-objects/auction-status';
import { Category } from '../value-objects/category';
import { Money } from '../value-objects/money';
import { Auction, type AuctionSnapshot } from './auction';
import { Bid } from './bid';
import {
  PaymentOrder,
  type PaymentOrderStatus,
} from './payment-order';
import { RejectedBidAttempt, RejectedBidReason } from './rejected-bid-attempt';

const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOSES_AT = new Date('2026-01-02T12:00:00.000Z');
const PAYMENT_CREATED_AT = new Date('2026-01-02T12:05:00.000Z');
const PAYMENT_DUE_AT = new Date('2026-01-04T12:05:00.000Z');

function bid(
  id: string,
  bidderId: string,
  amount: number,
  sequence: number,
): Bid {
  return new Bid(
    id,
    'auction-1',
    bidderId,
    new Money(amount),
    new Date(PUBLISHED_AT.getTime() + sequence * 60_000),
    sequence,
  );
}

function paymentOrder(status: PaymentOrderStatus = 'PENDING'): PaymentOrder {
  return PaymentOrder.restore({
    id: 'payment-1',
    auctionId: 'auction-1',
    debtorId: 'bidder-2',
    amount: new Money(120_000),
    createdAt: PAYMENT_CREATED_AT,
    dueAt: PAYMENT_DUE_AT,
    status,
  });
}

function snapshot(
  overrides: Partial<AuctionSnapshot> = {},
): AuctionSnapshot {
  return {
    id: 'auction-1',
    sellerId: 'seller-1',
    article: new Article('Reloj', 'Reloj mecánico de colección', 'USED'),
    category: new Category('Coleccionables'),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt: PUBLISHED_AT,
    closesAt: CLOSES_AT,
    status: AuctionStatus.OPEN,
    acceptedBids: [],
    rejectedBidAttempts: [],
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('restauración de Auction', () => {
  it('restaura una subasta abierta con varias pujas en su orden original', () => {
    const firstBid = bid('bid-1', 'bidder-1', 100_000, 1);
    const secondBid = bid('bid-2', 'bidder-2', 120_000, 2);

    const auction = Auction.restore(
      snapshot({ acceptedBids: [firstBid, secondBid] }),
    );

    expect(auction).toMatchObject({
      id: 'auction-1',
      sellerId: 'seller-1',
      status: AuctionStatus.OPEN,
      basePrice: new Money(100_000),
      minimumIncrement: new Money(10_000),
    });
    expect(auction.publishedAt).toEqual(PUBLISHED_AT);
    expect(auction.closesAt).toEqual(CLOSES_AT);
    expect(auction.acceptedBids).toEqual([firstBid, secondBid]);
    expect(auction.acceptedBids.map(({ id, sequence, amount, bidderId }) => ({
      id,
      sequence,
      amount: amount.amount,
      bidderId,
    }))).toEqual([
      { id: 'bid-1', sequence: 1, amount: 100_000, bidderId: 'bidder-1' },
      { id: 'bid-2', sequence: 2, amount: 120_000, bidderId: 'bidder-2' },
    ]);
    expect(auction.highestBid).toBe(secondBid);
  });

  it('restaura intentos rechazados con sus IDs, importes, fechas y motivos', () => {
    const attemptedAt = new Date('2026-01-01T13:00:00.000Z');
    const attempt = new RejectedBidAttempt(
      'rejected-7',
      'auction-1',
      'bidder-3',
      new Money(90_000),
      attemptedAt,
      RejectedBidReason.BID_BELOW_BASE_PRICE,
    );

    const auction = Auction.restore(
      snapshot({ rejectedBidAttempts: [attempt] }),
    );

    expect(auction.rejectedBidAttempts).toEqual([attempt]);
    expect(auction.rejectedBidAttempts[0]).toMatchObject({
      id: 'rejected-7',
      bidderId: 'bidder-3',
      attemptedAmount: new Money(90_000),
      reason: RejectedBidReason.BID_BELOW_BASE_PRICE,
    });
    expect(auction.rejectedBidAttempts[0]?.attemptedAt).toEqual(attemptedAt);
  });

  it('restaura una subasta cancelada sin inventar un resultado de cierre', () => {
    const auction = Auction.restore(
      snapshot({ status: AuctionStatus.CANCELLED }),
    );

    expect(auction.status).toBe(AuctionStatus.CANCELLED);
    expect(auction.closure).toBeUndefined();
    expect(auction.winnerId).toBeUndefined();
  });

  it('restaura una subasta cerrada con la última puja y la orden existentes', () => {
    const firstBid = bid('bid-1', 'bidder-1', 100_000, 1);
    const winningBid = bid('bid-2', 'bidder-2', 120_000, 2);
    const order = paymentOrder('PAID');

    const auction = Auction.restore(
      snapshot({
        status: AuctionStatus.CLOSED,
        acceptedBids: [firstBid, winningBid],
        closure: { winningBidId: winningBid.id, paymentOrder: order },
      }),
    );

    expect(auction.status).toBe(AuctionStatus.CLOSED);
    expect(auction.winnerId).toBe('bidder-2');
    expect(auction.closure?.winningBid).toBe(winningBid);
    expect(auction.closure?.paymentOrder).toBe(order);
    expect(auction.closure?.paymentOrder?.status).toBe('PAID');
  });

  it('restaura un cierre desierto sin puja ganadora ni orden', () => {
    const auction = Auction.restore(
      snapshot({ status: AuctionStatus.DESERTED, closure: {} }),
    );

    expect(auction.status).toBe(AuctionStatus.DESERTED);
    expect(auction.closure).toBeDefined();
    expect(auction.closure?.winningBid).toBeUndefined();
    expect(auction.closure?.paymentOrder).toBeUndefined();
  });

  it('no ejecuta publicación, cierre ni creación de órdenes al restaurar', () => {
    const publish = jest.spyOn(Auction, 'publish');
    const close = jest.spyOn(Auction.prototype, 'close');
    const createPaymentOrder = jest.spyOn(PaymentOrder, 'create');
    const winningBid = bid('bid-1', 'bidder-2', 120_000, 1);
    const order = paymentOrder();

    Auction.restore(
      snapshot({
        status: AuctionStatus.CLOSED,
        acceptedBids: [winningBid],
        closure: { winningBidId: winningBid.id, paymentOrder: order },
      }),
    );

    expect(publish).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(createPaymentOrder).not.toHaveBeenCalled();
  });

  it('rechaza una secuencia persistida incoherente', () => {
    const outOfSequenceBid = bid('bid-2', 'bidder-2', 120_000, 2);

    expect(() =>
      Auction.restore(snapshot({ acceptedBids: [outOfSequenceBid] })),
    ).toThrow(InvalidAuctionError);
  });
});

describe('restauración de PaymentOrder', () => {
  it.each<PaymentOrderStatus>(['PENDING', 'PAID', 'EXPIRED'])(
    'restaura una orden %s conservando todos sus datos',
    (status) => {
      const order = paymentOrder(status);

      expect(order).toMatchObject({
        id: 'payment-1',
        auctionId: 'auction-1',
        debtorId: 'bidder-2',
        amount: new Money(120_000),
        status,
      });
      expect(order.createdAt).toEqual(PAYMENT_CREATED_AT);
      expect(order.dueAt).toEqual(PAYMENT_DUE_AT);
    },
  );

  it('restaura el estado sin ejecutar transiciones operativas', () => {
    const confirm = jest.spyOn(
      PaymentOrder.prototype,
      'confirmWithVerifiedEvent',
    );
    const expire = jest.spyOn(PaymentOrder.prototype, 'expire');

    const order = paymentOrder('PAID');

    expect(confirm).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
    expect(order.status).toBe('PAID');
  });
});
