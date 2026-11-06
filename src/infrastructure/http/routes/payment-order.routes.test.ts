import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { createApp } from '../../../app';
import type { RealtimeEventPublisher } from '../../../application/ports/realtime-event-publisher';
import { Auction } from '../../../domain/entities/auction';
import { Bid } from '../../../domain/entities/bid';
import { PaymentOrder } from '../../../domain/entities/payment-order';
import { Article } from '../../../domain/value-objects/article';
import { AuctionStatus } from '../../../domain/value-objects/auction-status';
import { Category } from '../../../domain/value-objects/category';
import { Money } from '../../../domain/value-objects/money';
import { JwtAccessTokenService } from '../../auth/jwt-access-token-service';
import { InMemoryAuctionRepository } from '../../persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../../persistence/memory/in-memory-payment-order.repository';

const TOKEN_SECRET = 'payment-order-http-test-secret-32-characters';
async function setup(now = new Date('2026-01-01T13:00:00.000Z')) {
  const repository = new InMemoryPaymentOrderRepository();
  const auctionRepository = new InMemoryAuctionRepository();
  const events: Parameters<RealtimeEventPublisher['publish']>[0][] = [];
  const publisher: RealtimeEventPublisher = {
    publish: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };
  const tokenService = new JwtAccessTokenService(TOKEN_SECRET, 3600);
  const createdAt = new Date('2026-01-01T12:00:00.000Z');
  const order = PaymentOrder.create(
    'payment-1',
    'auction-1',
    'winner-1',
    new Money(120_000),
    createdAt,
  );
  const bid = new Bid(
    'bid-1',
    'auction-1',
    'winner-1',
    new Money(120_000),
    new Date('2026-01-01T11:00:00.000Z'),
    1,
  );
  const auction = Auction.restore({
    id: 'auction-1',
    sellerId: 'seller-1',
    article: new Article('Reloj', 'Reloj mecánico', 'USED'),
    category: new Category('Coleccionables'),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt: new Date('2026-01-01T10:00:00.000Z'),
    closesAt: createdAt,
    status: AuctionStatus.CLOSED,
    acceptedBids: [bid],
    rejectedBidAttempts: [],
    closure: { winningBidId: bid.id, paymentOrder: order },
  });
  await repository.save(order);
  await auctionRepository.save(auction);
  return {
    api: request(
      createApp({
        accessTokenService: tokenService,
        auctionRepository,
        clock: { now: () => new Date(now.getTime()) },
        paymentOrderRepository: repository,
        realtimeEventPublisher: publisher,
      }),
    ),
    auction,
    events,
    authorizationFor: (userId: string) =>
      `Bearer ${tokenService.issue({ userId }).token}`,
  };
}

function body<T>(response: SupertestResponse): T {
  return response.body as T;
}

describe('consulta HTTP de órdenes de pago', () => {
  it('permite al ganador consultar estado, importe, fechas y subasta', async () => {
    const context = await setup();

    const response = await context.api
      .get('/api/payment-orders/payment-1')
      .set('Authorization', context.authorizationFor('winner-1'));

    expect(response.status).toBe(200);
    expect(body<Record<string, unknown>>(response)).toEqual({
      id: 'payment-1',
      auctionId: 'auction-1',
      amount: 120_000,
      status: 'PENDING',
      createdAt: '2026-01-01T12:00:00.000Z',
      dueAt: '2026-01-03T12:00:00.000Z',
    });
    expect(response.body).not.toHaveProperty('debtorId');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rechaza al usuario distinto y las solicitudes sin token', async () => {
    const context = await setup();

    const forbidden = await context.api
      .get('/api/payment-orders/payment-1')
      .set('Authorization', context.authorizationFor('other-user'));
    const unauthorized = await context.api.get('/api/payment-orders/payment-1');

    expect(forbidden.status).toBe(403);
    expect(body<{ error: { code: string } }>(forbidden).error.code).toBe(
      'FORBIDDEN',
    );
    expect(unauthorized.status).toBe(401);
  });

  it('responde 404 para una orden inexistente', async () => {
    const context = await setup();

    const response = await context.api
      .get('/api/payment-orders/missing')
      .set('Authorization', context.authorizationFor('winner-1'));

    expect(response.status).toBe(404);
  });

  it('vence perezosamente la orden y marca la subasta como incumplida', async () => {
    const context = await setup(new Date('2026-01-03T12:00:00.000Z'));

    const response = await context.api
      .get('/api/payment-orders/payment-1')
      .set('Authorization', context.authorizationFor('winner-1'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({ status: 'EXPIRED' }),
    );
    expect(context.auction.status).toBe(AuctionStatus.DEFAULTED);
    expect(context.events).toContainEqual(
      expect.objectContaining({
        type: 'auction:defaulted',
        paymentOrderId: 'payment-1',
      }),
    );
  });
});
