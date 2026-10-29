import { describe, expect, it } from '@jest/globals';

import { InvalidAuctionStateError } from '../errors/invalid-auction-state.error';
import { InvalidPaymentOrderStateError } from '../errors/invalid-payment-order-state.error';
import type { Clock } from '../ports/clock';
import { Article } from '../value-objects/article';
import { AuctionStatus } from '../value-objects/auction-status';
import { Category } from '../value-objects/category';
import { Money } from '../value-objects/money';
import { Auction } from './auction';
import { PaymentEvent, type PaymentEventResult } from './payment-event';
import { PaymentOrder, type PaymentOrderStatus } from './payment-order';

const HOUR = 60 * 60 * 1000;
const CREATED_AT = new Date('2026-01-01T12:00:00.000Z');
const DUE_AT = new Date(CREATED_AT.getTime() + 48 * HOUR);
const AUCTION_CLOSES_AT = new Date(CREATED_AT.getTime() + HOUR);
const CLOCK: Clock = { now: () => new Date(CREATED_AT.getTime()) };

function createPaymentOrder(): PaymentOrder {
  return PaymentOrder.create(
    'payment-1',
    'auction-1',
    'bidder-1',
    new Money(100_000),
    CREATED_AT,
  );
}

function paymentEvent(
  result: PaymentEventResult = 'APPROVED',
  paymentOrderId = 'payment-1',
): PaymentEvent {
  return new PaymentEvent(
    'event-1',
    paymentOrderId,
    result,
    new Date(CREATED_AT.getTime() + HOUR),
    'verification-data-to-be-checked-by-application',
  );
}

function restorePaymentOrder(
  overrides: Partial<{
    id: string;
    auctionId: string;
    debtorId: string;
    amount: Money;
    status: PaymentOrderStatus;
  }> = {},
): PaymentOrder {
  return PaymentOrder.restore({
    id: 'payment-auction-1',
    auctionId: 'auction-1',
    debtorId: 'bidder-1',
    amount: new Money(100_000),
    createdAt: AUCTION_CLOSES_AT,
    dueAt: new Date(AUCTION_CLOSES_AT.getTime() + 48 * HOUR),
    status: 'EXPIRED',
    ...overrides,
  });
}

function createAuctionWithWinningBid(): Auction {
  const auction = Auction.publish(
    {
      id: 'auction-1',
      sellerId: 'seller-1',
      article: new Article('Reloj', 'Reloj mecánico', 'USED'),
      category: new Category('Coleccionables'),
      basePrice: new Money(100_000),
      minimumIncrement: new Money(10_000),
      closesAt: AUCTION_CLOSES_AT,
    },
    CLOCK,
  );
  auction.receiveBid({
    id: 'bid-1',
    bidderId: 'bidder-1',
    amount: new Money(100_000),
    placedAt: new Date(CREATED_AT.getTime() + 30 * 60 * 1000),
  });
  auction.close({
    closedAt: AUCTION_CLOSES_AT,
    paymentOrderId: 'payment-auction-1',
  });
  return auction;
}

describe('transiciones de PaymentOrder', () => {
  it('confirma PENDING → PAID con un evento aprobado de la misma orden', () => {
    const order = createPaymentOrder();

    order.confirmWithVerifiedEvent(paymentEvent());

    expect(order.status).toBe('PAID');
  });

  it('rechaza un evento REJECTED sin modificar la orden', () => {
    const order = createPaymentOrder();

    expect(() =>
      order.confirmWithVerifiedEvent(paymentEvent('REJECTED')),
    ).toThrow(InvalidPaymentOrderStateError);
    expect(order.status).toBe('PENDING');
  });

  it('rechaza un evento asociado a otra orden', () => {
    const order = createPaymentOrder();

    expect(() =>
      order.confirmWithVerifiedEvent(paymentEvent('APPROVED', 'payment-2')),
    ).toThrow(InvalidPaymentOrderStateError);
    expect(order.status).toBe('PENDING');
  });

  it('rechaza el vencimiento antes de dueAt', () => {
    const order = createPaymentOrder();

    expect(() => order.expire(new Date(DUE_AT.getTime() - 1))).toThrow(
      InvalidPaymentOrderStateError,
    );
    expect(order.status).toBe('PENDING');
  });

  it.each([
    ['exactamente en dueAt', DUE_AT],
    ['después de dueAt', new Date(DUE_AT.getTime() + 1)],
  ])('expira PENDING → EXPIRED %s', (_case, evaluatedAt) => {
    const order = createPaymentOrder();

    order.expire(evaluatedAt);

    expect(order.status).toBe('EXPIRED');
  });

  it('impide que una orden PAID expire o vuelva a confirmarse', () => {
    const order = createPaymentOrder();
    order.confirmWithVerifiedEvent(paymentEvent());

    expect(() => order.expire(DUE_AT)).toThrow(
      InvalidPaymentOrderStateError,
    );
    expect(() => order.confirmWithVerifiedEvent(paymentEvent())).toThrow(
      InvalidPaymentOrderStateError,
    );
    expect(order.status).toBe('PAID');
  });

  it('impide transiciones contradictorias desde EXPIRED', () => {
    const order = createPaymentOrder();
    order.expire(DUE_AT);

    expect(() => order.confirmWithVerifiedEvent(paymentEvent())).toThrow(
      InvalidPaymentOrderStateError,
    );
    expect(() => order.expire(new Date(DUE_AT.getTime() + 1))).toThrow(
      InvalidPaymentOrderStateError,
    );
    expect(order.status).toBe('EXPIRED');
  });
});

describe('transición de Auction a DEFAULTED', () => {
  it('marca CLOSED → DEFAULTED con su orden vencida y conserva el cierre', () => {
    const auction = createAuctionWithWinningBid();
    const order = auction.closure?.paymentOrder;
    expect(order).toBeDefined();
    if (!order) {
      throw new Error('La prueba requiere una orden de pago.');
    }
    order.expire(order.dueAt);

    const closure = auction.markAsDefaulted(order);

    expect(auction.status).toBe(AuctionStatus.DEFAULTED);
    expect(closure.status).toBe(AuctionStatus.DEFAULTED);
    expect(auction.closure?.status).toBe(AuctionStatus.DEFAULTED);
    expect(closure.winnerId).toBe('bidder-1');
    expect(closure.paymentOrder).toBe(order);
    expect(closure.paymentOrder?.status).toBe('EXPIRED');
  });

  it.each<PaymentOrderStatus>(['PENDING', 'PAID'])(
    'rechaza DEFAULTED con una orden %s',
    (status) => {
      const auction = createAuctionWithWinningBid();
      const order = restorePaymentOrder({ status });

      expect(() => auction.markAsDefaulted(order)).toThrow(
        InvalidAuctionStateError,
      );
      expect(auction.status).toBe(AuctionStatus.CLOSED);
      expect(auction.closure?.status).toBe(AuctionStatus.CLOSED);
    },
  );

  it('rechaza una orden perteneciente a otra subasta', () => {
    const auction = createAuctionWithWinningBid();
    const order = restorePaymentOrder({ auctionId: 'auction-2' });

    expect(() => auction.markAsDefaulted(order)).toThrow(
      InvalidAuctionStateError,
    );
    expect(auction.status).toBe(AuctionStatus.CLOSED);
  });

  it('rechaza una orden distinta de la asociada al cierre', () => {
    const auction = createAuctionWithWinningBid();
    const order = restorePaymentOrder({ id: 'payment-2' });

    expect(() => auction.markAsDefaulted(order)).toThrow(
      InvalidAuctionStateError,
    );
    expect(auction.status).toBe(AuctionStatus.CLOSED);
  });

  it('rechaza una orden cuyo deudor no es el ganador', () => {
    const auction = createAuctionWithWinningBid();
    const order = restorePaymentOrder({ debtorId: 'bidder-2' });

    expect(() => auction.markAsDefaulted(order)).toThrow(
      InvalidAuctionStateError,
    );
    expect(auction.status).toBe(AuctionStatus.CLOSED);
  });

  it('rechaza una orden cuyo importe no coincide con la puja ganadora', () => {
    const auction = createAuctionWithWinningBid();
    const order = restorePaymentOrder({ amount: new Money(110_000) });

    expect(() => auction.markAsDefaulted(order)).toThrow(
      InvalidAuctionStateError,
    );
    expect(auction.status).toBe(AuctionStatus.CLOSED);
  });

  it.each(['OPEN', 'CANCELLED', 'DESERTED'] as const)(
    'no permite DEFAULTED desde una subasta %s',
    (status) => {
      const auction = Auction.publish(
        {
          id: `auction-${status.toLowerCase()}`,
          sellerId: 'seller-1',
          article: new Article('Reloj', 'Reloj mecánico', 'USED'),
          category: new Category('Coleccionables'),
          basePrice: new Money(100_000),
          minimumIncrement: new Money(10_000),
          closesAt: AUCTION_CLOSES_AT,
        },
        CLOCK,
      );
      if (status === 'CANCELLED') {
        auction.cancel();
      }
      if (status === 'DESERTED') {
        auction.close({
          closedAt: AUCTION_CLOSES_AT,
          paymentOrderId: 'unused',
        });
      }

      expect(() =>
        auction.markAsDefaulted(
          restorePaymentOrder({ auctionId: auction.id }),
        ),
      ).toThrow(InvalidAuctionStateError);
      expect(auction.status.value).toBe(status);
    },
  );
});
