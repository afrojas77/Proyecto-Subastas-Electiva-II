import { describe, expect, it } from '@jest/globals';

import { BidRejectedError } from '../errors/bid-rejected.error';
import { InvalidAuctionError } from '../errors/invalid-auction.error';
import { InvalidAuctionStateError } from '../errors/invalid-auction-state.error';
import type { Clock } from '../ports/clock';
import { Article } from '../value-objects/article';
import { AuctionStatus } from '../value-objects/auction-status';
import { Category } from '../value-objects/category';
import { Money } from '../value-objects/money';
import {
  Auction,
  type PublishAuctionData,
  type ReceiveBidData,
} from './auction';
import { RejectedBidReason } from './rejected-bid-attempt';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOCK: Clock = {
  now: () => new Date(PUBLISHED_AT.getTime()),
};

const DEFAULT_AUCTION_DATA: PublishAuctionData = {
  id: 'auction-1',
  sellerId: 'seller-1',
  article: new Article('Reloj', 'Reloj mecánico de colección', 'USED'),
  category: new Category('Coleccionables'),
  basePrice: new Money(100_000),
  minimumIncrement: new Money(10_000),
  closesAt: new Date(PUBLISHED_AT.getTime() + DAY),
};

function createAuction(
  overrides: Partial<PublishAuctionData> = {},
  clock: Clock = CLOCK,
): Auction {
  return Auction.publish({ ...DEFAULT_AUCTION_DATA, ...overrides }, clock);
}

function bidData(overrides: Partial<ReceiveBidData> = {}): ReceiveBidData {
  return {
    id: 'bid-1',
    bidderId: 'bidder-1',
    amount: new Money(100_000),
    placedAt: new Date(PUBLISHED_AT.getTime() + 10 * 60 * 1000),
    ...overrides,
  };
}

function expectRejectedBid(
  auction: Auction,
  data: ReceiveBidData,
  reason: RejectedBidReason,
): void {
  const previousAttemptCount = auction.rejectedBidAttempts.length;

  try {
    auction.receiveBid(data);
    throw new Error('Se esperaba que la puja fuera rechazada.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(BidRejectedError);
    if (!(error instanceof BidRejectedError)) {
      throw error;
    }
    expect(error.reason).toBe(reason);
  }

  expect(auction.rejectedBidAttempts).toHaveLength(previousAttemptCount + 1);
  expect(auction.rejectedBidAttempts.at(-1)).toMatchObject({
    auctionId: auction.id,
    bidderId: data.bidderId,
    attemptedAmount: data.amount,
    reason,
  });
}

describe('publicación de una subasta', () => {
  it('publica con precio base e incremento mínimo válidos', () => {
    const auction = createAuction();

    expect(auction.basePrice.amount).toBe(100_000);
    expect(auction.minimumIncrement.amount).toBe(10_000);
    expect(auction.status).toBe(AuctionStatus.OPEN);
  });

  it('rechaza un precio base igual a cero', () => {
    expect(() => createAuction({ basePrice: new Money(0) })).toThrow(
      InvalidAuctionError,
    );
  });

  it('acepta un incremento mínimo positivo', () => {
    expect(
      createAuction({ minimumIncrement: new Money(1) }).minimumIncrement.amount,
    ).toBe(1);
  });

  it('rechaza un incremento mínimo igual a cero', () => {
    expect(() => createAuction({ minimumIncrement: new Money(0) })).toThrow(
      InvalidAuctionError,
    );
  });

  it('acepta un cierre posterior a la publicación', () => {
    const closesAt = new Date(PUBLISHED_AT.getTime() + 2 * HOUR);
    expect(createAuction({ closesAt }).closesAt).toEqual(closesAt);
  });

  it.each([
    ['igual', PUBLISHED_AT],
    ['anterior', new Date(PUBLISHED_AT.getTime() - 1)],
  ])('rechaza un cierre %s a la publicación', (_case, closesAt) => {
    expect(() => createAuction({ closesAt })).toThrow(InvalidAuctionError);
  });

  it('rechaza una subasta cuyo cierre ya pasó respecto al reloj de publicación', () => {
    const laterClock: Clock = {
      now: () => new Date(PUBLISHED_AT.getTime() + 2 * DAY),
    };

    expect(() => createAuction({}, laterClock)).toThrow(InvalidAuctionError);
  });

  it('captura la publicación desde un reloj inyectado mediante copia defensiva', () => {
    const clockValue = new Date(PUBLISHED_AT);
    const clock: Clock = { now: () => clockValue };

    const auction = createAuction({}, clock);
    clockValue.setFullYear(2040);

    expect(auction.publishedAt).toEqual(PUBLISHED_AT);
  });

  it('rechaza una duración menor a una hora', () => {
    expect(() =>
      createAuction({ closesAt: new Date(PUBLISHED_AT.getTime() + HOUR - 1) }),
    ).toThrow(InvalidAuctionError);
  });

  it('acepta una duración exactamente de una hora', () => {
    expect(
      createAuction({ closesAt: new Date(PUBLISHED_AT.getTime() + HOUR) })
        .status,
    ).toBe(AuctionStatus.OPEN);
  });

  it('acepta una duración exactamente de treinta días', () => {
    expect(
      createAuction({ closesAt: new Date(PUBLISHED_AT.getTime() + 30 * DAY) })
        .status,
    ).toBe(AuctionStatus.OPEN);
  });

  it('rechaza una duración superior a treinta días', () => {
    expect(() =>
      createAuction({
        closesAt: new Date(PUBLISHED_AT.getTime() + 30 * DAY + 1),
      }),
    ).toThrow(InvalidAuctionError);
  });
});

describe('cancelación de una subasta', () => {
  it('cancela una subasta sin pujas', () => {
    const auction = createAuction();

    auction.cancel();

    expect(auction.status).toBe(AuctionStatus.CANCELLED);
  });

  it('rechaza la cancelación después de una puja', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());

    expect(() => auction.cancel()).toThrow(InvalidAuctionStateError);
    expect(auction.status).toBe(AuctionStatus.OPEN);
  });

  it('rechaza la cancelación cuando la subasta ya está cerrada', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    auction.close({ closedAt: auction.closesAt, paymentOrderId: 'payment-1' });

    expect(() => auction.cancel()).toThrow(InvalidAuctionStateError);
  });
});

describe('recepción de pujas', () => {
  it('acepta una primera puja superior al precio base', () => {
    const auction = createAuction();

    const bid = auction.receiveBid(bidData({ amount: new Money(110_000) }));

    expect(bid.sequence).toBe(1);
    expect(auction.highestBid).toBe(bid);
  });

  it('rechaza una primera puja inferior al precio base', () => {
    const auction = createAuction();
    expectRejectedBid(
      auction,
      bidData({ amount: new Money(99_999) }),
      RejectedBidReason.BID_BELOW_BASE_PRICE,
    );
  });

  it('acepta una primera puja igual al precio base', () => {
    const auction = createAuction();

    expect(auction.receiveBid(bidData()).amount.amount).toBe(100_000);
  });

  it('acepta una puja posterior que cumple el incremento mínimo', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());

    const secondBid = auction.receiveBid(
      bidData({
        id: 'bid-2',
        bidderId: 'bidder-2',
        amount: new Money(110_000),
      }),
    );

    expect(secondBid.sequence).toBe(2);
    expect(auction.highestBid).toBe(secondBid);
  });

  it('rechaza una puja posterior que no alcanza el incremento mínimo', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    expectRejectedBid(
      auction,
      bidData({
        id: 'bid-2',
        bidderId: 'bidder-2',
        amount: new Money(109_999),
      }),
      RejectedBidReason.BID_INCREMENT_TOO_LOW,
    );
  });

  it('rechaza una puja igual a la vigente', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    expectRejectedBid(
      auction,
      bidData({ id: 'bid-2', bidderId: 'bidder-2' }),
      RejectedBidReason.BID_INCREMENT_TOO_LOW,
    );
  });

  it('rechaza al vendedor que intenta pujar', () => {
    const auction = createAuction();
    expectRejectedBid(
      auction,
      bidData({ bidderId: 'seller-1' }),
      RejectedBidReason.SELLER_CANNOT_BID,
    );
  });

  it('rechaza al mejor postor que intenta superar su propia puja', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    expectRejectedBid(
      auction,
      bidData({ id: 'bid-2', amount: new Money(120_000) }),
      RejectedBidReason.BIDDER_ALREADY_LEADING,
    );
  });

  it('rechaza una puja sobre una subasta cerrada', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    auction.close({ closedAt: auction.closesAt, paymentOrderId: 'payment-1' });
    expectRejectedBid(
      auction,
      bidData({
        id: 'bid-2',
        bidderId: 'bidder-2',
        amount: new Money(110_000),
      }),
      RejectedBidReason.AUCTION_NOT_OPEN,
    );
  });

  it('rechaza una puja sobre una subasta cancelada', () => {
    const auction = createAuction();
    auction.cancel();
    expectRejectedBid(auction, bidData(), RejectedBidReason.AUCTION_NOT_OPEN);
  });

  it('rechaza una puja sobre una subasta desierta', () => {
    const auction = createAuction();
    auction.close({ closedAt: auction.closesAt, paymentOrderId: 'unused' });
    expectRejectedBid(auction, bidData(), RejectedBidReason.AUCTION_NOT_OPEN);
  });

  it('rechaza y audita una puja presentada al llegar la fecha de cierre', () => {
    const auction = createAuction();
    expectRejectedBid(
      auction,
      bidData({ placedAt: auction.closesAt }),
      RejectedBidReason.AUCTION_NOT_OPEN,
    );
  });

  it('no expone una operación para retirar pujas y protege el historial interno', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());

    expect('withdrawBid' in auction).toBe(false);
    const exposedBids = [...auction.acceptedBids];
    exposedBids.length = 0;
    expect(auction.acceptedBids).toHaveLength(1);
  });
});

describe('inmutabilidad de las condiciones publicadas', () => {
  it('no permite sustituir precio, incremento ni fecha de cierre', () => {
    const auction = createAuction();
    const originalClosesAt = auction.closesAt;

    expect(Reflect.set(auction, 'basePrice', new Money(1))).toBe(false);
    expect(Reflect.set(auction, 'minimumIncrement', new Money(1))).toBe(false);
    expect(Reflect.set(auction, 'closesAt', new Date())).toBe(false);
    auction.closesAt.setFullYear(2040);

    expect(auction.basePrice.amount).toBe(100_000);
    expect(auction.minimumIncrement.amount).toBe(10_000);
    expect(auction.closesAt).toEqual(originalClosesAt);
  });
});

describe('cierre y adjudicación', () => {
  it('cierra con pujas, determina ganador y crea una orden a 48 horas', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    auction.receiveBid(
      bidData({
        id: 'bid-2',
        bidderId: 'bidder-2',
        amount: new Money(120_000),
      }),
    );
    const closedAt = auction.closesAt;

    const closure = auction.close({ closedAt, paymentOrderId: 'payment-1' });

    expect(auction.status).toBe(AuctionStatus.CLOSED);
    expect(auction.winnerId).toBe('bidder-2');
    expect(closure.winningBid?.amount.amount).toBe(120_000);
    expect(closure.paymentOrder).toMatchObject({
      id: 'payment-1',
      auctionId: auction.id,
      debtorId: 'bidder-2',
      amount: new Money(120_000),
      status: 'PENDING',
    });
    expect(closure.paymentOrder?.dueAt.getTime()).toBe(
      closedAt.getTime() + 48 * HOUR,
    );
  });

  it('declara desierta una subasta sin pujas y no crea orden de pago', () => {
    const auction = createAuction();

    const closure = auction.close({
      closedAt: auction.closesAt,
      paymentOrderId: 'unused',
    });

    expect(auction.status).toBe(AuctionStatus.DESERTED);
    expect(auction.winnerId).toBeUndefined();
    expect(closure.paymentOrder).toBeUndefined();
  });

  it('rechaza un cierre anterior a la fecha definida', () => {
    const auction = createAuction();
    expect(() =>
      auction.close({
        closedAt: new Date(auction.closesAt.getTime() - 1),
        paymentOrderId: 'payment-1',
      }),
    ).toThrow(InvalidAuctionStateError);
  });

  it('hace idempotente un segundo cierre sin alterar resultado ni orden', () => {
    const auction = createAuction();
    auction.receiveBid(bidData());
    const firstClosure = auction.close({
      closedAt: auction.closesAt,
      paymentOrderId: 'payment-1',
    });

    const secondClosure = auction.close({
      closedAt: new Date(auction.closesAt.getTime() + DAY),
      paymentOrderId: 'payment-2',
    });

    expect(secondClosure).toBe(firstClosure);
    expect(secondClosure.winnerId).toBe('bidder-1');
    expect(secondClosure.paymentOrder?.id).toBe('payment-1');
  });
});
