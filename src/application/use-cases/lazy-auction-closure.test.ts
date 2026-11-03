import { describe, expect, it, jest } from '@jest/globals';

import { BidRejectedError } from '../../domain/errors/bid-rejected.error';
import type { Clock } from '../../domain/ports/clock';
import { InMemoryAuctionRepository } from '../../infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../../infrastructure/persistence/memory/in-memory-payment-order.repository';
import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../ports/realtime-event-publisher';
import { GetAuction } from './get-auction';
import { PlaceBid } from './place-bid';
import { ProcessAuctionClosure } from './process-auction-closure';
import { PublishAuction } from './publish-auction';

const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOSES_AT = new Date('2026-01-01T13:00:00.000Z');

class MutableClock implements Clock {
  constructor(private value: Date) {}

  now(): Date {
    return new Date(this.value.getTime());
  }

  set(value: Date): void {
    this.value = new Date(value.getTime());
  }
}

class RecordingPublisher implements RealtimeEventPublisher {
  readonly events: RealtimeEvent[] = [];

  publish(event: RealtimeEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

function setup() {
  const auctionRepository = new InMemoryAuctionRepository();
  const paymentOrderRepository = new InMemoryPaymentOrderRepository();
  const clock = new MutableClock(PUBLISHED_AT);
  const publisher = new RecordingPublisher();
  const closure = new ProcessAuctionClosure(
    auctionRepository,
    clock,
    paymentOrderRepository,
    publisher,
  );
  return {
    auctionRepository,
    paymentOrderRepository,
    clock,
    publisher,
    publish: new PublishAuction(auctionRepository, clock),
    get: new GetAuction(auctionRepository, closure),
    placeBid: new PlaceBid(auctionRepository, clock, publisher, closure),
  };
}

async function publishAuction(context: ReturnType<typeof setup>) {
  return context.publish.execute({
    id: 'auction-1',
    sellerId: 'seller-1',
    article: {
      denomination: 'Reloj',
      description: 'Reloj mecánico',
      conservationState: 'USED',
    },
    category: 'Coleccionables',
    basePrice: 100_000,
    minimumIncrement: 10_000,
    closesAt: CLOSES_AT,
  });
}

async function placeInitialBid(context: ReturnType<typeof setup>) {
  return context.placeBid.execute({
    id: 'bid-1',
    auctionId: 'auction-1',
    bidderId: 'bidder-1',
    amount: 100_000,
  });
}

function closureEvents(context: ReturnType<typeof setup>) {
  return context.publisher.events.filter(
    (event) => event.type === 'auction:closed',
  );
}

function resultEvents(context: ReturnType<typeof setup>) {
  return context.publisher.events.filter(
    (event) => event.type === 'auction:result',
  );
}

describe('cierre perezoso de subastas', () => {
  it('no cierra una subasta consultada antes de closesAt', async () => {
    const context = setup();
    await publishAuction(context);
    context.clock.set(new Date(CLOSES_AT.getTime() - 1));

    const auction = await context.get.execute('auction-1');

    expect(auction.status.value).toBe('OPEN');
    expect(auction.closure).toBeUndefined();
    expect(closureEvents(context)).toHaveLength(0);
  });

  it('cierra exactamente en closesAt y adjudica al ganador correcto', async () => {
    const context = setup();
    await publishAuction(context);
    await placeInitialBid(context);
    context.clock.set(CLOSES_AT);

    const auction = await context.get.execute('auction-1');
    const order = await context.paymentOrderRepository.findById(
      'payment-auction-1',
    );

    expect(auction.status.value).toBe('CLOSED');
    expect(auction.winnerId).toBe('bidder-1');
    expect(order?.debtorId).toBe('bidder-1');
    expect(order?.amount.amount).toBe(100_000);
    expect(order?.createdAt).toEqual(CLOSES_AT);
    expect(closureEvents(context)).toHaveLength(1);
    expect(resultEvents(context)).toEqual([
      expect.objectContaining({
        recipientUserId: 'bidder-1',
        recipientRole: 'WINNER',
        status: 'CLOSED',
      }),
      expect.objectContaining({
        recipientUserId: 'seller-1',
        recipientRole: 'SELLER',
        status: 'CLOSED',
      }),
    ]);
  });

  it('cierra como desierta después de closesAt cuando no existen pujas', async () => {
    const context = setup();
    await publishAuction(context);
    context.clock.set(new Date(CLOSES_AT.getTime() + 1));

    const auction = await context.get.execute('auction-1');

    expect(auction.status.value).toBe('DESERTED');
    expect(auction.closure?.paymentOrder).toBeUndefined();
    expect(
      await context.paymentOrderRepository.findById('payment-auction-1'),
    ).toBeUndefined();
    expect(closureEvents(context)).toEqual([
      expect.objectContaining({
        type: 'auction:closed',
        status: 'DESERTED',
      }),
    ]);
    expect(resultEvents(context)).toEqual([
      expect.objectContaining({
        recipientUserId: 'seller-1',
        recipientRole: 'SELLER',
        status: 'DESERTED',
      }),
    ]);
  });

  it('no duplica orden ni evento en consultas repetidas o estado ya cerrado', async () => {
    const context = setup();
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    await publishAuction(context);
    await placeInitialBid(context);
    context.clock.set(CLOSES_AT);

    const first = await context.get.execute('auction-1');
    const second = await context.get.execute('auction-1');
    const third = await context.get.execute('auction-1');

    expect(first.closure).toBe(second.closure);
    expect(second.closure).toBe(third.closure);
    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(closureEvents(context)).toHaveLength(1);
    expect(resultEvents(context)).toHaveLength(2);
  });

  it('cierra antes de rechazar y auditar una puja tardía', async () => {
    const context = setup();
    await publishAuction(context);
    await placeInitialBid(context);
    context.clock.set(CLOSES_AT);

    await expect(
      context.placeBid.execute({
        id: 'late-bid',
        auctionId: 'auction-1',
        bidderId: 'bidder-2',
        amount: 120_000,
      }),
    ).rejects.toMatchObject({
      reason: 'AUCTION_NOT_OPEN',
    } satisfies Partial<BidRejectedError>);

    const auction = await context.auctionRepository.findById('auction-1');
    expect(auction?.status.value).toBe('CLOSED');
    expect(auction?.winnerId).toBe('bidder-1');
    expect(auction?.acceptedBids).toHaveLength(1);
    expect(auction?.rejectedBidAttempts.at(-1)).toMatchObject({
      bidderId: 'bidder-2',
      reason: 'AUCTION_NOT_OPEN',
    });
    expect(closureEvents(context)).toHaveLength(1);
  });

  it('conserva el flujo normal de puja antes del vencimiento', async () => {
    const context = setup();
    await publishAuction(context);
    context.clock.set(new Date(CLOSES_AT.getTime() - 1));

    const bid = await placeInitialBid(context);

    expect(bid.bidderId).toBe('bidder-1');
    expect(
      (await context.auctionRepository.findById('auction-1'))?.status.value,
    ).toBe('OPEN');
    expect(closureEvents(context)).toHaveLength(0);
  });
});
