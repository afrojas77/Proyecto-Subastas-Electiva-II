import { describe, expect, it } from '@jest/globals';

import { BidRejectedError } from '../../domain/errors/bid-rejected.error';
import type { Clock } from '../../domain/ports/clock';
import { InMemoryAuctionRepository } from '../../infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../../infrastructure/persistence/memory/in-memory-payment-order.repository';
import { CancelAuction } from './cancel-auction';
import { CloseAuction } from './close-auction';
import { GetAuction } from './get-auction';
import { PlaceBid } from './place-bid';
import { PublishAuction } from './publish-auction';

class FixedClock implements Clock {
  constructor(private currentTime: Date) {}

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  set(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');

function setup() {
  const auctionRepository = new InMemoryAuctionRepository();
  const paymentOrderRepository = new InMemoryPaymentOrderRepository();
  const clock = new FixedClock(PUBLISHED_AT);
  return {
    auctionRepository,
    paymentOrderRepository,
    clock,
    publishAuction: new PublishAuction(auctionRepository, clock),
    getAuction: new GetAuction(auctionRepository),
    cancelAuction: new CancelAuction(auctionRepository),
    placeBid: new PlaceBid(auctionRepository, clock),
    closeAuction: new CloseAuction(
      auctionRepository,
      clock,
      paymentOrderRepository,
    ),
  };
}

async function publishDefaultAuction(context: ReturnType<typeof setup>) {
  return context.publishAuction.execute({
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
    closesAt: new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000),
  });
}

describe('casos de uso de subastas', () => {
  it('publica y consulta una subasta mediante el puerto de repositorio', async () => {
    const context = setup();

    await publishDefaultAuction(context);
    const auction = await context.getAuction.execute('auction-1');

    expect(auction.id).toBe('auction-1');
    expect(auction.publishedAt).toEqual(PUBLISHED_AT);
  });

  it('cancela y persiste la subasta', async () => {
    const context = setup();
    await publishDefaultAuction(context);

    const auction = await context.cancelAuction.execute('auction-1');

    expect(auction.status.value).toBe('CANCELLED');
    expect((await context.getAuction.execute('auction-1')).status.value).toBe(
      'CANCELLED',
    );
  });

  it('registra una puja aceptada y persiste el agregado', async () => {
    const context = setup();
    await publishDefaultAuction(context);

    const bid = await context.placeBid.execute({
      id: 'bid-1',
      auctionId: 'auction-1',
      bidderId: 'bidder-1',
      amount: 100_000,
    });

    expect(bid.id).toBe('bid-1');
    expect(
      (await context.getAuction.execute('auction-1')).acceptedBids,
    ).toHaveLength(1);
  });

  it('persiste el intento rechazado antes de propagar el error', async () => {
    const context = setup();
    await publishDefaultAuction(context);

    await expect(
      context.placeBid.execute({
        id: 'bid-1',
        auctionId: 'auction-1',
        bidderId: 'bidder-1',
        amount: 99_999,
      }),
    ).rejects.toBeInstanceOf(BidRejectedError);

    const auction = await context.getAuction.execute('auction-1');
    expect(auction.rejectedBidAttempts).toHaveLength(1);
    expect(auction.rejectedBidAttempts[0]?.reason).toBe('BID_BELOW_BASE_PRICE');
  });

  it('cierra la subasta y conserva el resultado del segundo cierre', async () => {
    const context = setup();
    await publishDefaultAuction(context);
    await context.placeBid.execute({
      id: 'bid-1',
      auctionId: 'auction-1',
      bidderId: 'bidder-1',
      amount: 100_000,
    });
    context.clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const firstClosure = await context.closeAuction.execute('auction-1');
    const secondClosure = await context.closeAuction.execute('auction-1');

    expect(firstClosure.paymentOrder?.id).toBe('payment-auction-1');
    expect(secondClosure).toBe(firstClosure);
    expect(
      await context.paymentOrderRepository.findById('payment-auction-1'),
    ).toBe(firstClosure.paymentOrder);
  });
});
