import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { createApp } from '../../../app';
import type { RealtimeEventPublisher } from '../../../application/ports/realtime-event-publisher';
import type { Clock } from '../../../domain/ports/clock';

class MutableClock implements Clock {
  constructor(private currentTime: Date) {}

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  set(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

const PUBLISHED_AT = new Date('2026-01-01T12:00:00.000Z');
const silentPublisher: RealtimeEventPublisher = {
  publish: () => Promise.resolve(),
};

function auctionPayload(id = 'auction-1') {
  return {
    id,
    sellerId: 'seller-1',
    article: {
      denomination: 'Reloj',
      description: 'Reloj mecánico',
      conservationState: 'USED',
    },
    category: 'Coleccionables',
    basePrice: 100_000,
    minimumIncrement: 10_000,
    closesAt: new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

function setupApi() {
  const clock = new MutableClock(PUBLISHED_AT);
  return {
    api: request(
      createApp({ clock, realtimeEventPublisher: silentPublisher }),
    ),
    clock,
  };
}

function responseBody<T>(response: SupertestResponse): T {
  return response.body as T;
}

describe('rutas HTTP de subastas', () => {
  it('publica y consulta una subasta', async () => {
    const { api } = setupApi();

    const created = await api.post('/api/auctions').send(auctionPayload());
    const found = await api.get('/api/auctions/auction-1');

    const createdBody = responseBody<{ id: string }>(created);
    const foundBody = responseBody<{ status: string }>(found);

    expect(created.status).toBe(201);
    expect(createdBody.id).toBe('auction-1');
    expect(found.status).toBe(200);
    expect(foundBody.status).toBe('OPEN');
  });

  it('registra una puja y expone un historial sin información de contacto', async () => {
    const { api } = setupApi();
    await api.post('/api/auctions').send(auctionPayload());

    const bid = await api.post('/api/auctions/auction-1/bids').send({
      id: 'bid-1',
      bidderId: 'bidder-1',
      amount: 100_000,
    });
    const history = await api.get('/api/auctions/auction-1/bids');

    const historyBody = responseBody<{
      bids: Array<{ bidderId: string; amount: number; email?: string }>;
    }>(history);

    expect(bid.status).toBe(201);
    expect(history.status).toBe(200);
    expect(historyBody.bids).toEqual([
      expect.objectContaining({ bidderId: 'bidder-1', amount: 100_000 }),
    ]);
    expect(historyBody.bids[0]).not.toHaveProperty('email');
  });

  it('responde 400 y conserva el rechazo de una puja inválida', async () => {
    const { api } = setupApi();
    await api.post('/api/auctions').send(auctionPayload());

    const rejected = await api.post('/api/auctions/auction-1/bids').send({
      id: 'bid-1',
      bidderId: 'bidder-1',
      amount: 99_999,
    });

    const rejectedBody = responseBody<{ error: { code: string } }>(rejected);

    expect(rejected.status).toBe(400);
    expect(rejectedBody.error.code).toBe('BID_BELOW_BASE_PRICE');
  });

  it('responde 404 cuando la subasta no existe', async () => {
    const { api } = setupApi();

    const response = await api.get('/api/auctions/missing');

    const body = responseBody<{ error: { code: string } }>(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('responde conflicto al cancelar una subasta que ya tiene pujas', async () => {
    const { api } = setupApi();
    await api.post('/api/auctions').send(auctionPayload());
    await api.post('/api/auctions/auction-1/bids').send({
      id: 'bid-1',
      bidderId: 'bidder-1',
      amount: 100_000,
    });

    const response = await api.post('/api/auctions/auction-1/cancel');

    const body = responseBody<{ error: { code: string } }>(response);

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('INVALID_AUCTION_STATE');
  });

  it('cierra una subasta y devuelve su resultado', async () => {
    const { api, clock } = setupApi();
    await api.post('/api/auctions').send(auctionPayload());
    await api.post('/api/auctions/auction-1/bids').send({
      id: 'bid-1',
      bidderId: 'bidder-1',
      amount: 100_000,
    });
    clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const response = await api.post('/api/auctions/auction-1/close');

    const body = responseBody<{ status: string; winnerId: string }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('CLOSED');
    expect(body.winnerId).toBe('bidder-1');
  });
});
