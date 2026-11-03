import { createServer } from 'node:http';

import { createApp } from './app';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password-hasher';
import { loadAuthenticationConfig } from './infrastructure/auth/authentication-config';
import { JwtAccessTokenService } from './infrastructure/auth/jwt-access-token-service';
import { createPersistenceAdapters } from './infrastructure/persistence/persistence-factory';
import { SocketIoRealtimeEventPublisher } from './infrastructure/realtime/socket-io-realtime-event-publisher';

const port = Number(process.env.PORT ?? 3000);

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`No fue posible iniciar la aplicación: ${message}`);
  process.exitCode = 1;
});

async function bootstrap(): Promise<void> {
  const authentication = loadAuthenticationConfig(process.env);
  const persistence = await createPersistenceAdapters(process.env);
  const httpServer = createServer();
  const accessTokenService = new JwtAccessTokenService(
    authentication.tokenSecret,
    authentication.tokenExpiresInSeconds,
  );
  const realtimeEventPublisher =
    SocketIoRealtimeEventPublisher.attach(httpServer, accessTokenService);
  const app = createApp({
    realtimeEventPublisher,
    accessTokenService,
    auctionRepository: persistence.auctionRepository,
    passwordHasher: new BcryptPasswordHasher(),
    paymentEventRepository: persistence.paymentEventRepository,
    paymentOrderRepository: persistence.paymentOrderRepository,
    userRepository: persistence.userRepository,
  });
  httpServer.on('request', app);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await realtimeEventPublisher.close();
    } finally {
      await persistence.close();
    }
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  httpServer.listen(port, () => {
    console.log(`Servidor disponible en http://localhost:${port}`);
  });
}
