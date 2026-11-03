import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { io as createSocketClient, type Socket } from 'socket.io-client';

import { createApp } from '../../app';
import type { Clock } from '../../domain/ports/clock';
import { JwtAccessTokenService } from '../auth/jwt-access-token-service';
import { InMemoryAuctionRepository } from '../persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from '../persistence/memory/in-memory-payment-order.repository';
import {
  SUBSCRIBE_TO_AUCTION_EVENT,
  SocketIoRealtimeEventPublisher,
} from './socket-io-realtime-event-publisher';

const STARTED_AT = new Date('2026-01-01T12:00:00.000Z');
const CLOSES_AT = new Date('2026-01-01T13:00:00.000Z');
const TOKEN_SECRET = 'socket-integration-secret-with-at-least-32-characters';

class MutableClock implements Clock {
  constructor(private value: Date) {}

  now(): Date {
    return new Date(this.value.getTime());
  }

  set(value: Date): void {
    this.value = new Date(value.getTime());
  }
}

interface TestContext {
  baseUrl: string;
  clock: MutableClock;
  httpServer: HttpServer;
  publisher: SocketIoRealtimeEventPublisher;
  tokenService: JwtAccessTokenService;
  clients: Socket[];
}

interface SubscriptionResponse {
  joined: boolean;
  auctionId?: string;
  error?: string;
}

describe('integración real de Socket.IO', () => {
  it('rechaza conexiones no autenticadas e impide suplantar la sala privada', async () => {
    const context = await startContext();
    try {
      await expectConnectionError(context.baseUrl, {});
      await expectConnectionError(context.baseUrl, { token: 'invalid-token' });
      const expiredToken = new JwtAccessTokenService(
        TOKEN_SECRET,
        -1,
      ).issue({ userId: 'expired-user' }).token;
      await expectConnectionError(context.baseUrl, { token: expiredToken });

      const userToken = tokenFor(context, 'user-1');
      const client = await connectClient(context, {
        token: userToken,
        userId: 'victim-user',
      });
      await expect(requestSubscription(client, 'user/victim')).resolves.toEqual(
        {
          joined: false,
          error: 'auctionId tiene un formato inválido.',
        },
      );
      const ownResult = waitForEvent<{ recipientRole: string }>(
        client,
        'auction:result',
      );
      await context.publisher.publish({
        type: 'auction:result',
        auctionId: 'auction-1',
        recipientUserId: 'user-1',
        recipientRole: 'SELLER',
        status: 'DESERTED',
        closedAt: CLOSES_AT.toISOString(),
      });

      await expect(ownResult).resolves.toEqual(
        expect.objectContaining({ recipientRole: 'SELLER' }),
      );
      let receivedVictimEvent = false;
      client.once('auction:result', () => {
        receivedVictimEvent = true;
      });
      await context.publisher.publish({
        type: 'auction:result',
        auctionId: 'auction-1',
        recipientUserId: 'victim-user',
        recipientRole: 'SELLER',
        status: 'DESERTED',
        closedAt: CLOSES_AT.toISOString(),
      });
      await settleEmissions();
      expect(receivedVictimEvent).toBe(false);
    } finally {
      await stopContext(context);
    }
  });

  it('coordina tres clientes, pujas, postor superado y cierre', async () => {
    const context = await startContext();
    try {
      const seller = await connectClient(context, {
        token: tokenFor(context, 'seller-1'),
      });
      const bidder = await connectClient(context, {
        token: tokenFor(context, 'bidder-1'),
      });
      const challenger = await connectClient(context, {
        token: tokenFor(context, 'bidder-2'),
      });
      await subscribe(seller, 'auction-1');
      await subscribe(bidder, 'auction-1');

      const api = request(context.baseUrl);
      await api
        .post('/api/auctions')
        .set('Authorization', bearer(context, 'seller-1'))
        .send({
          id: 'auction-1',
          article: {
            denomination: 'Reloj',
            description: 'Reloj mecánico',
            conservationState: 'USED',
          },
          category: 'Coleccionables',
          basePrice: 100_000,
          minimumIncrement: 10_000,
          closesAt: CLOSES_AT.toISOString(),
        })
        .expect(201);

      const sellerFirstBid = waitForEvent<Record<string, unknown>>(
        seller,
        'auction:bid-accepted',
      );
      const bidderFirstBid = waitForEvent<Record<string, unknown>>(
        bidder,
        'auction:bid-accepted',
      );
      let challengerReceivedWithoutSubscription = false;
      challenger.once('auction:bid-accepted', () => {
        challengerReceivedWithoutSubscription = true;
      });
      await api
        .post('/api/auctions/auction-1/bids')
        .set('Authorization', bearer(context, 'bidder-1'))
        .send({ id: 'bid-1', amount: 100_000 })
        .expect(201);

      expect(await sellerFirstBid).toEqual(
        expect.objectContaining({
          auctionId: 'auction-1',
          bidderId: 'bidder-1',
          amount: 100_000,
        }),
      );
      await expect(bidderFirstBid).resolves.toEqual(
        expect.objectContaining({ bidId: 'bid-1' }),
      );
      await settleEmissions();
      expect(challengerReceivedWithoutSubscription).toBe(false);

      await subscribe(challenger, 'auction-1');
      const bidderOutbid = waitForEvent<Record<string, unknown>>(
        bidder,
        'auction:bid-outbid',
      );
      let sellerReceivedOutbid = false;
      let challengerReceivedOutbid = false;
      seller.once('auction:bid-outbid', () => {
        sellerReceivedOutbid = true;
      });
      challenger.once('auction:bid-outbid', () => {
        challengerReceivedOutbid = true;
      });
      const publicSecondBid = [seller, bidder, challenger].map((client) =>
        waitForEvent<Record<string, unknown>>(
          client,
          'auction:bid-accepted',
        ),
      );
      await api
        .post('/api/auctions/auction-1/bids')
        .set('Authorization', bearer(context, 'bidder-2'))
        .send({ id: 'bid-2', amount: 110_000 })
        .expect(201);

      await expect(Promise.all(publicSecondBid)).resolves.toHaveLength(3);
      await expect(bidderOutbid).resolves.toEqual(
        expect.objectContaining({
          auctionId: 'auction-1',
          newBidId: 'bid-2',
          currentAmount: 110_000,
        }),
      );
      await settleEmissions();
      expect(sellerReceivedOutbid).toBe(false);
      expect(challengerReceivedOutbid).toBe(false);

      context.clock.set(CLOSES_AT);
      const publicClosures = [seller, bidder, challenger].map((client) =>
        waitForEvent<Record<string, unknown>>(client, 'auction:closed'),
      );
      const sellerResult = waitForEvent<Record<string, unknown>>(
        seller,
        'auction:result',
      );
      const winnerResult = waitForEvent<Record<string, unknown>>(
        challenger,
        'auction:result',
      );
      let losingBidderReceivedResult = false;
      bidder.once('auction:result', () => {
        losingBidderReceivedResult = true;
      });
      await api.get('/api/auctions/auction-1').expect(200);

      await expect(Promise.all(publicClosures)).resolves.toHaveLength(3);
      await expect(sellerResult).resolves.toEqual(
        expect.objectContaining({
          recipientRole: 'SELLER',
          status: 'CLOSED',
          winnerId: 'bidder-2',
        }),
      );
      await expect(winnerResult).resolves.toEqual(
        expect.objectContaining({
          recipientRole: 'WINNER',
          paymentOrderId: 'payment-auction-1',
          winningAmount: 110_000,
        }),
      );
      await settleEmissions();
      expect(losingBidderReceivedResult).toBe(false);
    } finally {
      await stopContext(context);
    }
  });
});

async function startContext(): Promise<TestContext> {
  const httpServer = createServer();
  const tokenService = new JwtAccessTokenService(TOKEN_SECRET, 3600);
  const publisher = SocketIoRealtimeEventPublisher.attach(
    httpServer,
    tokenService,
  );
  const clock = new MutableClock(STARTED_AT);
  const app = createApp({
    accessTokenService: tokenService,
    auctionRepository: new InMemoryAuctionRepository(),
    clock,
    paymentOrderRepository: new InMemoryPaymentOrderRepository(),
    realtimeEventPublisher: publisher,
  });
  httpServer.on('request', app);
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    clock,
    httpServer,
    publisher,
    tokenService,
    clients: [],
  };
}

async function stopContext(context: TestContext): Promise<void> {
  context.clients.forEach((client) => client.close());
  await context.publisher.close();
  if (context.httpServer.listening) {
    await new Promise<void>((resolve, reject) => {
      context.httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function connectClient(
  context: TestContext,
  auth: Record<string, string>,
): Promise<Socket> {
  const client = createSocketClient(context.baseUrl, {
    auth,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  context.clients.push(client);
  return client;
}

async function expectConnectionError(
  baseUrl: string,
  auth: Record<string, string>,
): Promise<void> {
  const client = createSocketClient(baseUrl, {
    auth,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  try {
    const error = await new Promise<Error>((resolve) => {
      client.once('connect_error', resolve);
    });
    expect(error.message).toBe('Se requiere un token de acceso válido.');
  } finally {
    client.close();
  }
}

function subscribe(
  client: Socket,
  auctionId: string,
): Promise<SubscriptionResponse> {
  return requestSubscription(client, auctionId).then((response) => {
    if (!response.joined) {
      throw new Error(response.error);
    }
    return response;
  });
}

function requestSubscription(
  client: Socket,
  auctionId: string,
): Promise<SubscriptionResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Socket.IO no confirmó la suscripción.')),
      2_000,
    );
    client.emit(
      SUBSCRIBE_TO_AUCTION_EVENT,
      auctionId,
      (response: SubscriptionResponse) => {
        clearTimeout(timeout);
        resolve(response);
      },
    );
  });
}

function waitForEvent<T>(client: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`No se recibió ${event}.`)),
      2_000,
    );
    client.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

function tokenFor(context: TestContext, userId: string): string {
  return context.tokenService.issue({ userId }).token;
}

function bearer(context: TestContext, userId: string): string {
  return `Bearer ${tokenFor(context, userId)}`;
}

function settleEmissions(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}
