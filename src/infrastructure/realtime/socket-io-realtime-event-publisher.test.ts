import { describe, expect, it, jest } from '@jest/globals';
import type { Server as SocketIoServer } from 'socket.io';
import type { AccessTokenService } from '../../application/ports/access-token-service';

import {
  roomForUser,
  roomForAuction,
  SUBSCRIBE_TO_AUCTION_EVENT,
  SocketIoRealtimeEventPublisher,
} from './socket-io-realtime-event-publisher';

const tokens: AccessTokenService = {
  issue: () => ({ token: 'token', expiresAt: new Date() }),
  verify: () => ({ userId: 'user-1' }),
};

describe('SocketIoRealtimeEventPublisher', () => {
  it('traduce el evento tipado a la sala y emisión Socket.IO', async () => {
    const emit = jest.fn(() => true);
    const to = jest.fn(() => ({ emit }));
    const io = {
      use: jest.fn(),
      on: jest.fn(),
      to,
    } as unknown as SocketIoServer;
    const publisher = SocketIoRealtimeEventPublisher.fromServer(io, tokens);

    await publisher.publish({
      type: 'auction:bid-accepted',
      auctionId: 'auction-1',
      bidId: 'bid-1',
      bidderId: 'bidder-1',
      amount: 100_000,
      placedAt: '2026-01-01T12:30:00.000Z',
      sequence: 1,
    });

    expect(to).toHaveBeenCalledWith('auction:auction-1');
    expect(emit).toHaveBeenCalledWith('auction:bid-accepted', {
      auctionId: 'auction-1',
      bidId: 'bid-1',
      bidderId: 'bidder-1',
      amount: 100_000,
      placedAt: '2026-01-01T12:30:00.000Z',
      sequence: 1,
    });
  });

  it('dirige eventos privados a la sala del usuario sin filtrar el destinatario', async () => {
    const emit = jest.fn(() => true);
    const to = jest.fn(() => ({ emit }));
    const io = {
      use: jest.fn(),
      on: jest.fn(),
      to,
    } as unknown as SocketIoServer;
    const publisher = SocketIoRealtimeEventPublisher.fromServer(io, tokens);

    await publisher.publish({
      type: 'auction:bid-outbid',
      auctionId: 'auction-1',
      recipientUserId: 'bidder-previous',
      newBidId: 'bid-2',
      currentAmount: 120_000,
      occurredAt: '2026-01-01T12:40:00.000Z',
    });

    expect(to).toHaveBeenCalledWith(roomForUser('bidder-previous'));
    expect(emit).toHaveBeenCalledWith('auction:bid-outbid', {
      auctionId: 'auction-1',
      newBidId: 'bid-2',
      currentAmount: 120_000,
      occurredAt: '2026-01-01T12:40:00.000Z',
    });
  });

  it('registra la unión a una sala de subasta sin usar la red', () => {
    let connectionHandler: ((socket: unknown) => void) | undefined;
    const io = {
      use: jest.fn(),
      on: jest.fn((event: string, handler: (socket: unknown) => void) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
    } as unknown as SocketIoServer;
    SocketIoRealtimeEventPublisher.fromServer(io, tokens);
    let joinHandler:
      | ((
          auctionId: unknown,
          acknowledge?: (response: unknown) => void,
        ) => void)
      | undefined;
    const join = jest.fn(() => Promise.resolve());
    const socket = {
      on: jest.fn(
        (
          event: string,
          handler: (
            auctionId: unknown,
            acknowledge?: (response: unknown) => void,
          ) => void,
        ) => {
          if (event === SUBSCRIBE_TO_AUCTION_EVENT) {
            joinHandler = handler;
          }
        },
      ),
      join,
      data: { authenticatedUserId: 'user-1' },
      disconnect: jest.fn(),
    };
    connectionHandler?.(socket);
    const acknowledge = jest.fn();

    joinHandler?.(' auction-1 ', acknowledge);

    expect(join).toHaveBeenCalledWith(roomForUser('user-1'));
    expect(join).toHaveBeenCalledWith(roomForAuction('auction-1'));
    expect(acknowledge).toHaveBeenCalledWith({
      joined: true,
      auctionId: 'auction-1',
    });

    join.mockClear();
    const invalidAcknowledge = jest.fn();
    joinHandler?.('user/victim', invalidAcknowledge);
    expect(join).not.toHaveBeenCalled();
    expect(invalidAcknowledge).toHaveBeenCalledWith({
      joined: false,
      error: 'auctionId tiene un formato inválido.',
    });
  });

  it('cierra el servidor Socket.IO mediante el ciclo de vida del adaptador', async () => {
    const close = jest.fn((callback: (error?: Error) => void) => {
      callback();
      return Promise.resolve();
    });
    const io = {
      use: jest.fn(),
      on: jest.fn(),
      close,
    } as unknown as SocketIoServer;
    const publisher = SocketIoRealtimeEventPublisher.fromServer(io, tokens);

    await publisher.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
