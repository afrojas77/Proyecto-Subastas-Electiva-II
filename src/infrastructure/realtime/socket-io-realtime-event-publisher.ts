import type { Server as HttpServer } from 'node:http';

import { Server as SocketIoServer } from 'socket.io';

import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../../application/ports/realtime-event-publisher';

export const JOIN_AUCTION_ROOM_EVENT = 'auction:join';

interface JoinAuctionRoomResponse {
  joined: boolean;
  auctionId?: string;
  error?: string;
}

export class SocketIoRealtimeEventPublisher
  implements RealtimeEventPublisher
{
  private constructor(private readonly io: SocketIoServer) {
    this.configureAuctionRooms();
  }

  static attach(httpServer: HttpServer): SocketIoRealtimeEventPublisher {
    return new SocketIoRealtimeEventPublisher(
      new SocketIoServer(httpServer, { serveClient: false }),
    );
  }

  static fromServer(io: SocketIoServer): SocketIoRealtimeEventPublisher {
    return new SocketIoRealtimeEventPublisher(io);
  }

  publish(event: RealtimeEvent): Promise<void> {
    const { type, auctionId, ...payload } = event;
    this.io.to(roomForAuction(auctionId)).emit(type, {
      auctionId,
      ...payload,
    });
    return Promise.resolve();
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      void this.io.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private configureAuctionRooms(): void {
    this.io.on('connection', (socket) => {
      socket.on(
        JOIN_AUCTION_ROOM_EVENT,
        (
          auctionId: unknown,
          acknowledge?: (response: JoinAuctionRoomResponse) => void,
        ) => {
          if (typeof auctionId !== 'string' || !auctionId.trim()) {
            acknowledge?.({
              joined: false,
              error: 'auctionId debe ser texto no vacío.',
            });
            return;
          }

          const normalizedAuctionId = auctionId.trim();
          void socket.join(roomForAuction(normalizedAuctionId));
          acknowledge?.({ joined: true, auctionId: normalizedAuctionId });
        },
      );
    });
  }
}

export function roomForAuction(auctionId: string): string {
  return `auction:${auctionId}`;
}
