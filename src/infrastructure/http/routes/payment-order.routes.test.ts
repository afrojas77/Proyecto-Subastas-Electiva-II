import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { createApp } from '../../../app';
import type { RealtimeEventPublisher } from '../../../application/ports/realtime-event-publisher';
import { PaymentOrder } from '../../../domain/entities/payment-order';
import { Money } from '../../../domain/value-objects/money';
import { JwtAccessTokenService } from '../../auth/jwt-access-token-service';
import { InMemoryPaymentOrderRepository } from '../../persistence/memory/in-memory-payment-order.repository';

const TOKEN_SECRET = 'payment-order-http-test-secret-32-characters';
const silentPublisher: RealtimeEventPublisher = {
  publish: () => Promise.resolve(),
};

async function setup() {
  const repository = new InMemoryPaymentOrderRepository();
  const tokenService = new JwtAccessTokenService(TOKEN_SECRET, 3600);
  const createdAt = new Date('2026-01-01T12:00:00.000Z');
  await repository.save(
    PaymentOrder.create(
      'payment-1',
      'auction-1',
      'winner-1',
      new Money(120_000),
      createdAt,
    ),
  );
  return {
    api: request(
      createApp({
        accessTokenService: tokenService,
        paymentOrderRepository: repository,
        realtimeEventPublisher: silentPublisher,
      }),
    ),
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
    const unauthorized = await context.api.get(
      '/api/payment-orders/payment-1',
    );

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
});
