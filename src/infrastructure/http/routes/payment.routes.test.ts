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
import { DevelopmentOnlyPaymentNotificationVerifier } from '../../payments/development-only-payment-notification-verifier';
import { InMemoryAuctionRepository } from '../../persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentEventRepository } from '../../persistence/memory/in-memory-payment-event.repository';
import { InMemoryPaymentOrderRepository } from '../../persistence/memory/in-memory-payment-order.repository';
import { SIMULATED_PAYMENT_SECRET_HEADER } from '../controllers/payment.controller';

const WEBHOOK_SECRET = 'test-only-webhook-secret';
const silentPublisher: RealtimeEventPublisher = {
  publish: () => Promise.resolve(),
};
const VALID_PAYLOAD = {
  id: 'event-1',
  paymentOrderId: 'payment-1',
  result: 'APPROVED',
  occurredAt: '2026-01-01T13:00:00.000Z',
};

async function setupApi(now = new Date('2026-01-01T13:00:00.000Z')) {
  const auctionRepository = new InMemoryAuctionRepository();
  const paymentOrderRepository = new InMemoryPaymentOrderRepository();
  const paymentEventRepository = new InMemoryPaymentEventRepository();
  const order = PaymentOrder.create(
    'payment-1',
    'auction-1',
    'bidder-1',
    new Money(100_000),
    new Date('2026-01-01T12:00:00.000Z'),
  );
  const bid = new Bid(
    'bid-1',
    'auction-1',
    'bidder-1',
    new Money(100_000),
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
    closesAt: new Date('2026-01-01T12:00:00.000Z'),
    status: AuctionStatus.CLOSED,
    acceptedBids: [bid],
    rejectedBidAttempts: [],
    closure: { winningBidId: bid.id, paymentOrder: order },
  });
  await paymentOrderRepository.save(order);
  await auctionRepository.save(auction);
  const app = createApp({
    auctionRepository,
    clock: { now: () => new Date(now.getTime()) },
    realtimeEventPublisher: silentPublisher,
    paymentOrderRepository,
    paymentEventRepository,
    paymentNotificationVerifier: new DevelopmentOnlyPaymentNotificationVerifier(
      WEBHOOK_SECRET,
    ),
  });
  return {
    api: request(app),
    auction,
    order,
    paymentEventRepository,
  };
}

function responseBody<T>(response: SupertestResponse): T {
  return response.body as T;
}

describe('POST /api/payments/webhook', () => {
  it('rechaza un origen inválido aunque el cliente envíe verified: true', async () => {
    const context = await setupApi();

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, 'wrong-secret')
      .send({ ...VALID_PAYLOAD, verified: true });

    expect(response.status).toBe(401);
    expect(responseBody<{ error: { code: string } }>(response).error.code).toBe(
      'UNVERIFIED_PAYMENT_NOTIFICATION',
    );
    expect(context.order.status).toBe('PENDING');
    expect(
      await context.paymentEventRepository.findById('event-1'),
    ).toBeUndefined();
  });

  it('procesa una notificación aprobada legítima', async () => {
    const context = await setupApi();

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send(VALID_PAYLOAD);

    expect(response.status).toBe(200);
    expect(responseBody<Record<string, unknown>>(response)).toEqual({
      eventId: 'event-1',
      paymentOrderId: 'payment-1',
      result: 'APPROVED',
      orderStatus: 'PAID',
    });
    expect(context.order.status).toBe('PAID');
  });

  it('registra una notificación rechazada sin pagar la orden', async () => {
    const context = await setupApi();

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({ ...VALID_PAYLOAD, result: 'REJECTED' });

    expect(response.status).toBe(200);
    expect(responseBody<Record<string, unknown>>(response)).toEqual({
      eventId: 'event-1',
      paymentOrderId: 'payment-1',
      result: 'REJECTED',
      orderStatus: 'PENDING',
    });
    expect(context.order.status).toBe('PENDING');
  });

  it('devuelve exactamente la misma respuesta para un reintento idéntico', async () => {
    const context = await setupApi();

    const first = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send(VALID_PAYLOAD);
    const second = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({ ...VALID_PAYLOAD });

    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(context.order.status).toBe('PAID');
  });

  it('responde conflicto para el mismo ID con contenido diferente', async () => {
    const context = await setupApi();
    await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({ ...VALID_PAYLOAD, result: 'REJECTED' });

    const conflict = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send(VALID_PAYLOAD);

    expect(conflict.status).toBe(409);
    expect(responseBody<{ error: { code: string } }>(conflict).error.code).toBe(
      'PAYMENT_EVENT_CONFLICT',
    );
    expect(context.order.status).toBe('PENDING');
  });

  it('responde 404 para una orden inexistente', async () => {
    const context = await setupApi();

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({ ...VALID_PAYLOAD, paymentOrderId: 'missing' });

    expect(response.status).toBe(404);
    expect(
      await context.paymentEventRepository.findById('event-1'),
    ).toBeUndefined();
  });

  it('responde conflicto cuando la orden no permite confirmación', async () => {
    const context = await setupApi();
    context.order.expire(context.order.dueAt);
    context.auction.markAsDefaulted(context.order);

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send(VALID_PAYLOAD);

    expect(response.status).toBe(409);
    expect(responseBody<{ error: { code: string } }>(response).error.code).toBe(
      'INVALID_PAYMENT_ORDER_STATE',
    );
    expect(
      await context.paymentEventRepository.findById('event-1'),
    ).toBeUndefined();
  });

  it('vence una orden atrasada antes de aceptar una confirmación tardía', async () => {
    const context = await setupApi(new Date('2026-01-03T12:00:00.000Z'));

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({
        ...VALID_PAYLOAD,
        occurredAt: '2026-01-03T12:00:00.000Z',
      });

    expect(response.status).toBe(409);
    expect(context.order.status).toBe('EXPIRED');
    expect(context.auction.status).toBe(AuctionStatus.DEFAULTED);
    expect(
      await context.paymentEventRepository.findById('event-1'),
    ).toBeUndefined();
  });

  it('responde 400 para una notificación legítima pero malformada', async () => {
    const context = await setupApi();

    const response = await context.api
      .post('/api/payments/webhook')
      .set(SIMULATED_PAYMENT_SECRET_HEADER, WEBHOOK_SECRET)
      .send({ id: 'event-1' });

    expect(response.status).toBe(400);
    expect(responseBody<{ error: { code: string } }>(response).error.code).toBe(
      'INVALID_PAYMENT_NOTIFICATION',
    );
    expect(context.order.status).toBe('PENDING');
  });
});
