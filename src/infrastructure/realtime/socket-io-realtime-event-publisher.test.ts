import { describe, expect, it, jest } from '@jest/globals';
import type { Server as SocketIoServer } from 'socket.io';

import {
  JOIN_AUCTION_ROOM_EVENT,
  roomForAuction,
  SocketIoRealtimeEventPublisher,
} from './socket-io-realtime-event-publisher';

describe('SocketIoRealtimeEventPublisher', () => {
  it('traduce el evento tipado a la sala y emisión Socket.IO', async () => {
    const emit = jest.fn(() => true);
    const to = jest.fn(() => ({ emit }));
    const io = {
      on: jest.fn(),
      to,
    } as unknown as SocketIoServer;
    const publisher = SocketIoRealtimeEventPublisher.fromServer(io);

    await publisher.publish({
      type: 'auction:bid-accepted',
      auctionId: 'auction-1',
      bidId: 'bid-1',
      amount: 100_000,
      placedAt: '2026-01-01T12:30:00.000Z',
      sequence: 1,
    });

    expect(to).toHaveBeenCalledWith('auction:auction-1');
    expect(emit).toHaveBeenCalledWith('auction:bid-accepted', {
      auctionId: 'auction-1',
      bidId: 'bid-1',
      amount: 100_000,
      placedAt: '2026-01-01T12:30:00.000Z',
      sequence: 1,
    });
  });

  it('registra la unión a una sala de subasta sin usar la red', () => {
    let connectionHandler: ((socket: unknown) => void) | undefined;
    const io = {
      on: jest.fn((event: string, handler: (socket: unknown) => void) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      }),
    } as unknown as SocketIoServer;
    SocketIoRealtimeEventPublisher.fromServer(io);
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
          if (event === JOIN_AUCTION_ROOM_EVENT) {
            joinHandler = handler;
          }
        },
      ),
      join,
    };
    connectionHandler?.(socket);
    const acknowledge = jest.fn();

    joinHandler?.(' auction-1 ', acknowledge);

    expect(join).toHaveBeenCalledWith(roomForAuction('auction-1'));
    expect(acknowledge).toHaveBeenCalledWith({
      joined: true,
      auctionId: 'auction-1',
    });
  });

  it('cierra el servidor Socket.IO mediante el ciclo de vida del adaptador', async () => {
    const close = jest.fn((callback: (error?: Error) => void) => {
      callback();
      return Promise.resolve();
    });
    const io = {
      on: jest.fn(),
      close,
    } as unknown as SocketIoServer;
    const publisher = SocketIoRealtimeEventPublisher.fromServer(io);

    await publisher.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
