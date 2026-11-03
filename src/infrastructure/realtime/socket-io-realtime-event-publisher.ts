import type { Server as HttpServer } from 'node:http';

import { Server as SocketIoServer } from 'socket.io';

import type { AccessTokenService } from '../../application/ports/access-token-service';
import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../../application/ports/realtime-event-publisher';

export const SUBSCRIBE_TO_AUCTION_EVENT = 'auction:subscribe';
const AUCTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

interface JoinAuctionRoomResponse {
  joined: boolean;
  auctionId?: string;
  error?: string;
}

export class SocketIoRealtimeEventPublisher
  implements RealtimeEventPublisher
{
  private constructor(
    private readonly io: SocketIoServer,
    accessTokenService: AccessTokenService,
  ) {
    this.configureAuthentication(accessTokenService);
    this.configureAuctionRooms();
  }

  static attach(
    httpServer: HttpServer,
    accessTokenService: AccessTokenService,
  ): SocketIoRealtimeEventPublisher {
    return new SocketIoRealtimeEventPublisher(
      new SocketIoServer(httpServer, { serveClient: false }),
      accessTokenService,
    );
  }

  static fromServer(
    io: SocketIoServer,
    accessTokenService: AccessTokenService,
  ): SocketIoRealtimeEventPublisher {
    return new SocketIoRealtimeEventPublisher(io, accessTokenService);
  }

  publish(event: RealtimeEvent): Promise<void> {
    if (
      event.type === 'auction:bid-outbid' ||
      event.type === 'auction:result'
    ) {
      const { type, recipientUserId, ...payload } = event;
      this.io.to(roomForUser(recipientUserId)).emit(type, payload);
      return Promise.resolve();
    }
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

  private configureAuthentication(
    accessTokenService: AccessTokenService,
  ): void {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token as unknown;
      if (typeof token !== 'string' || !token.trim()) {
        next(new Error('Se requiere un token de acceso válido.'));
        return;
      }
      try {
        const identity = accessTokenService.verify(token);
        const socketData = socket.data as Record<string, unknown>;
        socketData.authenticatedUserId = identity.userId;
        next();
      } catch {
        next(new Error('Se requiere un token de acceso válido.'));
      }
    });
  }

  private configureAuctionRooms(): void {
    this.io.on('connection', (socket) => {
      const socketData = socket.data as Record<string, unknown>;
      const userId = socketData.authenticatedUserId;
      if (typeof userId !== 'string') {
        socket.disconnect(true);
        return;
      }
      void socket.join(roomForUser(userId));
      socket.on(
        SUBSCRIBE_TO_AUCTION_EVENT,
        (
          auctionId: unknown,
          acknowledge?: (response: JoinAuctionRoomResponse) => void,
        ) => {
          if (
            typeof auctionId !== 'string' ||
            !AUCTION_ID_PATTERN.test(auctionId.trim())
          ) {
            acknowledge?.({
              joined: false,
              error: 'auctionId tiene un formato inválido.',
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

export function roomForUser(userId: string): string {
  return `user:${userId}`;
}
