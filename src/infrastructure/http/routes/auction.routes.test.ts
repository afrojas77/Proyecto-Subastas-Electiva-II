import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { createApp } from '../../../app';
import type { RealtimeEventPublisher } from '../../../application/ports/realtime-event-publisher';
import type { Clock } from '../../../domain/ports/clock';
import { JwtAccessTokenService } from '../../auth/jwt-access-token-service';

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
const TOKEN_SECRET = 'auction-http-test-secret-with-at-least-32-characters';

function auctionPayload(id = 'auction-1') {
  return {
    id,
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
  const accessTokenService = new JwtAccessTokenService(TOKEN_SECRET, 3600);
  return {
    api: request(
      createApp({
        accessTokenService,
        clock,
        realtimeEventPublisher: silentPublisher,
      }),
    ),
    clock,
    authorizationFor: (userId: string) =>
      `Bearer ${accessTokenService.issue({ userId }).token}`,
  };
}

function responseBody<T>(response: SupertestResponse): T {
  return response.body as T;
}

describe('rutas HTTP de subastas', () => {
  it('lista con filtros, paginación y totales correctos', async () => {
    const { api, authorizationFor } = setupApi();
    for (const [id, category] of [
      ['auction-1', 'Libros'],
      ['auction-2', 'Libros'],
      ['auction-3', 'Arte'],
      ['auction-4', 'Libros'],
    ]) {
      await api
        .post('/api/auctions')
        .set('Authorization', authorizationFor('seller-1'))
        .send({ ...auctionPayload(id), category });
    }
    await api
      .post('/api/auctions/auction-4/cancel')
      .set('Authorization', authorizationFor('seller-1'));

    const first = await api.get(
      '/api/auctions?category=Libros&status=OPEN&page=1&limit=1',
    );
    const second = await api.get(
      '/api/auctions?category=Libros&status=OPEN&page=2&limit=1',
    );
    const empty = await api.get(
      '/api/auctions?category=Libros&status=OPEN&page=3&limit=1',
    );

    expect(bodyOfList(first)).toEqual(
      expect.objectContaining({ page: 1, limit: 1, total: 2, totalPages: 2 }),
    );
    expect(bodyOfList(first).auctions.map(({ id }) => id)).toEqual([
      'auction-1',
    ]);
    expect(bodyOfList(second).auctions.map(({ id }) => id)).toEqual([
      'auction-2',
    ]);
    expect(bodyOfList(empty).auctions).toEqual([]);
  });

  it('conserva el listado sin filtros y acepta el límite máximo', async () => {
    const { api, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());

    const response = await api.get('/api/auctions?limit=100');

    expect(response.status).toBe(200);
    expect(bodyOfList(response)).toEqual(
      expect.objectContaining({ page: 1, limit: 100, total: 1, totalPages: 1 }),
    );
  });

  it.each([
    '/api/auctions?page=0',
    '/api/auctions?page=1.5',
    '/api/auctions?limit=-1',
    '/api/auctions?limit=101',
    '/api/auctions?status=UNKNOWN',
  ])('rechaza parámetros de listado inválidos: %s', async (url) => {
    const { api } = setupApi();

    const response = await api.get(url);

    expect(response.status).toBe(400);
  });

  it('publica y consulta una subasta', async () => {
    const { api, authorizationFor } = setupApi();

    const created = await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    const found = await api
      .get('/api/auctions/auction-1')
      .set('Authorization', authorizationFor('registered-viewer'));

    const createdBody = responseBody<{ id: string; sellerId: string }>(created);
    const foundBody = responseBody<{
      status: string;
      highestBid: unknown;
      bids: unknown[];
    }>(found);

    expect(created.status).toBe(201);
    expect(createdBody.id).toBe('auction-1');
    expect(createdBody.sellerId).toBe('seller-1');
    expect(found.status).toBe(200);
    expect(foundBody.status).toBe('OPEN');
    expect(foundBody.highestBid).toBeNull();
    expect(foundBody.bids).toEqual([]);
  });

  it('registra una puja y expone un historial sin información de contacto', async () => {
    const { api, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());

    const bid = await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', amount: 100_000 });
    const history = await api
      .get('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('registered-viewer'));
    const detail = await api
      .get('/api/auctions/auction-1')
      .set('Authorization', authorizationFor('registered-viewer'));

    const historyBody = responseBody<{
      bids: Array<{ bidderId: string; amount: number; email?: string }>;
    }>(history);

    expect(bid.status).toBe(201);
    expect(history.status).toBe(200);
    expect(historyBody.bids).toEqual([
      expect.objectContaining({ bidderId: 'bidder-1', amount: 100_000 }),
    ]);
    expect(historyBody.bids[0]).not.toHaveProperty('email');
    expect(
      responseBody<{ highestBid: { id: string }; bids: unknown[] }>(detail),
    ).toEqual(
      expect.objectContaining({
        highestBid: expect.objectContaining({ id: 'bid-1' }),
        bids: [expect.objectContaining({ id: 'bid-1' })],
      }),
    );
  });

  it('responde 400 y conserva el rechazo de una puja inválida', async () => {
    const { api, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());

    const rejected = await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', amount: 99_999 });

    const rejectedBody = responseBody<{ error: { code: string } }>(rejected);

    expect(rejected.status).toBe(400);
    expect(rejectedBody.error.code).toBe('BID_BELOW_BASE_PRICE');
  });

  it('responde 404 cuando la subasta no existe', async () => {
    const { api, authorizationFor } = setupApi();

    const response = await api
      .get('/api/auctions/missing')
      .set('Authorization', authorizationFor('registered-viewer'));

    const body = responseBody<{ error: { code: string } }>(response);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('responde conflicto al cancelar una subasta que ya tiene pujas', async () => {
    const { api, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', amount: 100_000 });

    const response = await api
      .post('/api/auctions/auction-1/cancel')
      .set('Authorization', authorizationFor('seller-1'));

    const body = responseBody<{ error: { code: string } }>(response);

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('INVALID_AUCTION_STATE');
  });

  it('cierra una subasta y devuelve su resultado', async () => {
    const { api, clock, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', amount: 100_000 });
    clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const response = await api
      .post('/api/auctions/auction-1/close')
      .set('Authorization', authorizationFor('seller-1'));

    const body = responseBody<{ status: string; winnerId: string }>(response);

    expect(response.status).toBe(200);
    expect(body.status).toBe('CLOSED');
    expect(body.winnerId).toBe('bidder-1');
  });

  it('protege el cierre manual y sólo lo permite al vendedor', async () => {
    const { api, clock, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const withoutToken = await api.post('/api/auctions/auction-1/close');
    const otherUser = await api
      .post('/api/auctions/auction-1/close')
      .set('Authorization', authorizationFor('other-user'));
    const seller = await api
      .post('/api/auctions/auction-1/close')
      .set('Authorization', authorizationFor('seller-1'));

    expect(withoutToken.status).toBe(401);
    expect(otherUser.status).toBe(403);
    expect(seller.status).toBe(200);
    expect(responseBody<{ status: string }>(seller).status).toBe('DESERTED');
  });

  it('cierra perezosamente al consultar exactamente en closesAt', async () => {
    const { api, clock, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', amount: 100_000 });
    clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const response = await api
      .get('/api/auctions/auction-1')
      .set('Authorization', authorizationFor('registered-viewer'));

    expect(response.status).toBe(200);
    expect(
      responseBody<{ status: string; winnerId: string }>(response),
    ).toEqual(
      expect.objectContaining({ status: 'CLOSED', winnerId: 'bidder-1' }),
    );
  });

  it('cierra y rechaza una puja tardía', async () => {
    const { api, clock, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    clock.set(new Date(PUBLISHED_AT.getTime() + 60 * 60 * 1000));

    const bid = await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'late-bid', amount: 100_000 });
    const auction = await api
      .get('/api/auctions/auction-1')
      .set('Authorization', authorizationFor('registered-viewer'));

    expect(bid.status).toBe(400);
    expect(responseBody<{ error: { code: string } }>(bid).error.code).toBe(
      'AUCTION_NOT_OPEN',
    );
    expect(responseBody<{ status: string }>(auction).status).toBe('DESERTED');
  });

  it('rechaza sin token publicación, detalle, puja, cancelación e historial', async () => {
    const { api } = setupApi();

    const publish = await api.post('/api/auctions').send(auctionPayload());
    const detail = await api.get('/api/auctions/auction-1');
    const bid = await api
      .post('/api/auctions/auction-1/bids')
      .send({ id: 'bid-1', amount: 100_000 });
    const cancel = await api.post('/api/auctions/auction-1/cancel');
    const history = await api.get('/api/auctions/auction-1/bids');

    expect([
      publish.status,
      detail.status,
      bid.status,
      cancel.status,
      history.status,
    ]).toEqual([401, 401, 401, 401, 401]);
  });

  it('rechaza sellerId y bidderId enviados por el cliente', async () => {
    const { api, authorizationFor } = setupApi();
    const publishSpoof = await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send({ ...auctionPayload(), sellerId: 'victim-seller' });

    expect(publishSpoof.status).toBe(400);

    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());
    const bidSpoof = await api
      .post('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'))
      .send({ id: 'bid-1', bidderId: 'victim-bidder', amount: 100_000 });

    expect(bidSpoof.status).toBe(400);
    const history = await api
      .get('/api/auctions/auction-1/bids')
      .set('Authorization', authorizationFor('bidder-1'));
    expect(responseBody<{ bids: unknown[] }>(history).bids).toHaveLength(0);
  });

  it('permite cancelar al vendedor y responde 403 para otro usuario', async () => {
    const { api, authorizationFor } = setupApi();
    await api
      .post('/api/auctions')
      .set('Authorization', authorizationFor('seller-1'))
      .send(auctionPayload());

    const forbidden = await api
      .post('/api/auctions/auction-1/cancel')
      .set('Authorization', authorizationFor('other-user'));
    const allowed = await api
      .post('/api/auctions/auction-1/cancel')
      .set('Authorization', authorizationFor('seller-1'));

    expect(forbidden.status).toBe(403);
    expect(
      responseBody<{ error: { code: string } }>(forbidden).error.code,
    ).toBe('FORBIDDEN');
    expect(allowed.status).toBe(200);
    expect(responseBody<{ status: string }>(allowed).status).toBe('CANCELLED');
  });
});

function bodyOfList(response: SupertestResponse): {
  auctions: Array<{ id: string }>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
} {
  return responseBody(response);
}
