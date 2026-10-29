import { describe, expect, it, jest } from '@jest/globals';

import { Auction } from '../../domain/entities/auction';
import { PaymentEvent } from '../../domain/entities/payment-event';
import { PaymentOrder } from '../../domain/entities/payment-order';
import { InvalidAuctionStateError } from '../../domain/errors/invalid-auction-state.error';
import type { Clock } from '../../domain/ports/clock';
import { Article } from '../../domain/value-objects/article';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import { Category } from '../../domain/value-objects/category';
import { Money } from '../../domain/value-objects/money';
import { InMemoryAuctionRepository } from '../../infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../../infrastructure/persistence/memory/in-memory-payment-order.repository';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../ports/realtime-event-publisher';
import { ProcessPaymentOrderExpiration } from './process-payment-order-expiration';

const HOUR = 60 * 60 * 1000;
const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOSES_AT = new Date(PUBLISHED_AT.getTime() + HOUR);

class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}

class RecordingRealtimeEventPublisher implements RealtimeEventPublisher {
  readonly events: RealtimeEvent[] = [];

  publish(event: RealtimeEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

function createClosedAuction(): Auction {
  const auction = Auction.publish(
    {
      id: 'auction-1',
      sellerId: 'seller-1',
      article: new Article('Reloj', 'Reloj mecánico', 'USED'),
      category: new Category('Coleccionables'),
      basePrice: new Money(100_000),
      minimumIncrement: new Money(10_000),
      closesAt: CLOSES_AT,
    },
    new FixedClock(PUBLISHED_AT),
  );
  auction.receiveBid({
    id: 'bid-1',
    bidderId: 'bidder-1',
    amount: new Money(100_000),
    placedAt: new Date(PUBLISHED_AT.getTime() + 30 * 60 * 1000),
  });
  auction.close({
    closedAt: CLOSES_AT,
    paymentOrderId: 'payment-1',
  });
  return auction;
}

async function setup(evaluatedAt?: Date) {
  const auctionRepository = new InMemoryAuctionRepository();
  const paymentOrderRepository = new InMemoryPaymentOrderRepository();
  const auction = createClosedAuction();
  const order = auction.closure?.paymentOrder;
  if (!order) {
    throw new Error('La prueba requiere una orden de pago.');
  }
  await auctionRepository.save(auction);
  await paymentOrderRepository.save(order);
  const now = evaluatedAt ?? order.dueAt;
  const realtimeEventPublisher = new RecordingRealtimeEventPublisher();
  return {
    auction,
    order,
    auctionRepository,
    paymentOrderRepository,
    realtimeEventPublisher,
    useCase: new ProcessPaymentOrderExpiration(
      paymentOrderRepository,
      auctionRepository,
      new FixedClock(now),
      realtimeEventPublisher,
    ),
  };
}

describe('ProcessPaymentOrderExpiration', () => {
  it('mantiene pendiente una orden antes de dueAt y no escribe', async () => {
    const base = await setup();
    const context = await setup(new Date(base.order.dueAt.getTime() - 1));
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    const result = await context.useCase.execute(context.order.id);

    expect(result).toEqual({
      outcome: 'NOT_DUE',
      paymentOrderId: 'payment-1',
      auctionId: 'auction-1',
      orderStatus: 'PENDING',
    });
    expect(context.order.status).toBe('PENDING');
    expect(context.auction.status).toBe(AuctionStatus.CLOSED);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it.each([
    ['exactamente en dueAt', 0],
    ['después de dueAt', 1],
  ])('vence la orden %s y guarda ambos agregados', async (_case, offset) => {
    const initial = await setup();
    const context = await setup(
      new Date(initial.order.dueAt.getTime() + offset),
    );
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    const result = await context.useCase.execute(context.order.id);

    expect(result).toEqual({
      outcome: 'PROCESSED',
      paymentOrderId: 'payment-1',
      auctionId: 'auction-1',
      orderStatus: 'EXPIRED',
      auctionStatus: 'DEFAULTED',
    });
    expect(context.order.status).toBe('EXPIRED');
    expect(context.auction.status).toBe(AuctionStatus.DEFAULTED);
    expect(context.auction.closure?.status).toBe(AuctionStatus.DEFAULTED);
    expect(context.auction.winnerId).toBe('bidder-1');
    expect(context.auction.closure?.paymentOrder).toBe(context.order);
    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(saveOrder).toHaveBeenCalledWith(context.order);
    expect(saveAuction).toHaveBeenCalledTimes(1);
    expect(saveAuction).toHaveBeenCalledWith(context.auction);
    expect(context.realtimeEventPublisher.events).toEqual([
      {
        type: 'auction:defaulted',
        auctionId: 'auction-1',
        paymentOrderId: 'payment-1',
        dueAt: context.order.dueAt.toISOString(),
        orderStatus: 'EXPIRED',
        auctionStatus: 'DEFAULTED',
      },
    ]);
  });

  it('no vence una orden pagada ni modifica su subasta', async () => {
    const context = await setup();
    context.order.confirmWithVerifiedEvent(
      new PaymentEvent(
        'event-1',
        context.order.id,
        'APPROVED',
        CLOSES_AT,
        'verified-by-test',
      ),
    );
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    const result = await context.useCase.execute(context.order.id);

    expect(result.outcome).toBe('PAID');
    expect(context.order.status).toBe('PAID');
    expect(context.auction.status).toBe(AuctionStatus.CLOSED);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it('reconoce una orden y subasta ya procesadas sin volver a escribir', async () => {
    const context = await setup();
    context.order.expire(context.order.dueAt);
    context.auction.markAsDefaulted(context.order);
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    const result = await context.useCase.execute(context.order.id);

    expect(result.outcome).toBe('ALREADY_PROCESSED');
    expect(context.order.status).toBe('EXPIRED');
    expect(context.auction.status).toBe(AuctionStatus.DEFAULTED);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it('informa una subasta inexistente sin vencer ni guardar la orden', async () => {
    const paymentOrderRepository = new InMemoryPaymentOrderRepository();
    const auctionRepository = new InMemoryAuctionRepository();
    const order = PaymentOrder.create(
      'payment-missing-auction',
      'missing-auction',
      'bidder-1',
      new Money(100_000),
      CLOSES_AT,
    );
    await paymentOrderRepository.save(order);
    const saveOrder = jest.spyOn(paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(auctionRepository, 'save');
    const useCase = new ProcessPaymentOrderExpiration(
      paymentOrderRepository,
      auctionRepository,
      new FixedClock(order.dueAt),
      new RecordingRealtimeEventPublisher(),
    );

    await expect(useCase.execute(order.id)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
    expect(order.status).toBe('PENDING');
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
  });

  it('rechaza una asociación inconsistente y no declara éxito ni guarda', async () => {
    const context = await setup();
    const inconsistentOrder = PaymentOrder.restore({
      id: 'payment-other',
      auctionId: context.auction.id,
      debtorId: 'bidder-1',
      amount: new Money(100_000),
      createdAt: CLOSES_AT,
      dueAt: context.order.dueAt,
      status: 'PENDING',
    });
    await context.paymentOrderRepository.save(inconsistentOrder);
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    await expect(
      context.useCase.execute(inconsistentOrder.id),
    ).rejects.toBeInstanceOf(InvalidAuctionStateError);
    expect(context.auction.status).toBe(AuctionStatus.CLOSED);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
  });

  it('rechaza una orden vencida si la subasta no refleja el incumplimiento', async () => {
    const context = await setup();
    context.order.expire(context.order.dueAt);
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveAuction = jest.spyOn(context.auctionRepository, 'save');

    await expect(
      context.useCase.execute(context.order.id),
    ).rejects.toBeInstanceOf(InvalidAuctionStateError);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(saveAuction).not.toHaveBeenCalled();
  });
});
