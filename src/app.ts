import express from 'express';

import type { AccessTokenService } from './application/ports/access-token-service';
import type { IdGenerator } from './application/ports/id-generator';
import { CancelAuction } from './application/use-cases/cancel-auction';
import { CloseAuction } from './application/use-cases/close-auction';
import { GetAuctionBidHistory } from './application/use-cases/get-auction-bid-history';
import { GetAuction } from './application/use-cases/get-auction';
import { ListAuctions } from './application/use-cases/list-auctions';
import { PlaceBid } from './application/use-cases/place-bid';
import { ProcessPaymentNotification } from './application/use-cases/process-payment-notification';
import { ProcessPaymentOrderExpiration } from './application/use-cases/process-payment-order-expiration';
import { ProcessAuctionClosure } from './application/use-cases/process-auction-closure';
import { PublishAuction } from './application/use-cases/publish-auction';
import { GetAuthenticatedProfile } from './application/use-cases/get-authenticated-profile';
import { GetPaymentOrder } from './application/use-cases/get-payment-order';
import { LoginUser } from './application/use-cases/login-user';
import { RegisterUser } from './application/use-cases/register-user';
import type { PaymentNotificationVerifier } from './application/ports/payment-notification-verifier';
import type { PasswordHasher } from './application/ports/password-hasher';
import type { RealtimeEventPublisher } from './application/ports/realtime-event-publisher';
import type { PersistenceTransaction } from './application/ports/persistence-transaction';
import type { AuctionRepository } from './domain/ports/auction.repository';
import type { Clock } from './domain/ports/clock';
import type { PaymentEventRepository } from './domain/ports/payment-event.repository';
import type { PaymentOrderRepository } from './domain/ports/payment-order.repository';
import type { UserRepository } from './domain/ports/user.repository';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password-hasher';
import { loadAuthenticationConfig } from './infrastructure/auth/authentication-config';
import { JwtAccessTokenService } from './infrastructure/auth/jwt-access-token-service';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { AuctionController } from './infrastructure/http/controllers/auction.controller';
import { PaymentController } from './infrastructure/http/controllers/payment.controller';
import { PaymentOrderController } from './infrastructure/http/controllers/payment-order.controller';
import { UserController } from './infrastructure/http/controllers/user.controller';
import { createAuthenticationMiddleware } from './infrastructure/http/middlewares/authentication.middleware';
import { createAuthRouter } from './infrastructure/http/routes/auth.routes';
import { healthRouter } from './infrastructure/http/routes/health.routes';
import { createErrorMiddleware } from './infrastructure/http/middlewares/error.middleware';
import { createAuctionRouter } from './infrastructure/http/routes/auction.routes';
import { createPaymentRouter } from './infrastructure/http/routes/payment.routes';
import { createPaymentOrderRouter } from './infrastructure/http/routes/payment-order.routes';
import { createUserRouter } from './infrastructure/http/routes/user.routes';
import { RandomUuidGenerator } from './infrastructure/identity/random-uuid-generator';
import { ConsoleLogger } from './infrastructure/logging/console-logger';
import { DevelopmentOnlyPaymentNotificationVerifier } from './infrastructure/payments/development-only-payment-notification-verifier';
import { InMemoryAuctionRepository } from './infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentEventRepository } from './infrastructure/persistence/memory/in-memory-payment-event.repository';
import { InMemoryPaymentOrderRepository } from './infrastructure/persistence/memory/in-memory-payment-order.repository';
import { InMemoryUserRepository } from './infrastructure/persistence/memory/in-memory-user.repository';
import { SystemClock } from './infrastructure/time/system-clock';

export interface AppDependencies {
  realtimeEventPublisher: RealtimeEventPublisher;
  accessTokenService?: AccessTokenService;
  auctionRepository?: AuctionRepository;
  clock?: Clock;
  idGenerator?: IdGenerator;
  passwordHasher?: PasswordHasher;
  paymentEventRepository?: PaymentEventRepository;
  paymentNotificationVerifier?: PaymentNotificationVerifier;
  paymentOrderRepository?: PaymentOrderRepository;
  persistenceTransaction?: PersistenceTransaction;
  userRepository?: UserRepository;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const auctionRepository =
    dependencies.auctionRepository ?? new InMemoryAuctionRepository();
  const clock = dependencies.clock ?? new SystemClock();
  const paymentOrderRepository =
    dependencies.paymentOrderRepository ?? new InMemoryPaymentOrderRepository();
  const paymentEventRepository =
    dependencies.paymentEventRepository ?? new InMemoryPaymentEventRepository();
  const paymentNotificationVerifier =
    dependencies.paymentNotificationVerifier ?? createDevelopmentVerifier();
  const userRepository =
    dependencies.userRepository ?? new InMemoryUserRepository();
  const passwordHasher =
    dependencies.passwordHasher ?? new BcryptPasswordHasher();
  const accessTokenService =
    dependencies.accessTokenService ?? createDefaultAccessTokenService();
  const idGenerator = dependencies.idGenerator ?? new RandomUuidGenerator();
  const logger = new ConsoleLogger();
  const processAuctionClosure = new ProcessAuctionClosure(
    auctionRepository,
    clock,
    paymentOrderRepository,
    dependencies.realtimeEventPublisher,
    dependencies.persistenceTransaction,
  );
  const processPaymentOrderExpiration = new ProcessPaymentOrderExpiration(
    paymentOrderRepository,
    auctionRepository,
    clock,
    dependencies.realtimeEventPublisher,
    dependencies.persistenceTransaction,
  );
  const auctionController = new AuctionController(
    new PublishAuction(auctionRepository, clock),
    new GetAuction(auctionRepository, processAuctionClosure),
    new ListAuctions(auctionRepository),
    new CancelAuction(auctionRepository),
    new PlaceBid(
      auctionRepository,
      clock,
      dependencies.realtimeEventPublisher,
      processAuctionClosure,
    ),
    new GetAuctionBidHistory(auctionRepository),
    new CloseAuction(auctionRepository, processAuctionClosure),
    logger,
  );
  const paymentController = new PaymentController(
    new ProcessPaymentNotification(
      paymentNotificationVerifier,
      paymentOrderRepository,
      paymentEventRepository,
      dependencies.realtimeEventPublisher,
      dependencies.persistenceTransaction,
      processPaymentOrderExpiration,
    ),
  );
  const paymentOrderController = new PaymentOrderController(
    new GetPaymentOrder(paymentOrderRepository, processPaymentOrderExpiration),
  );
  const userController = new UserController(
    new RegisterUser(userRepository, passwordHasher, idGenerator),
    new GetAuthenticatedProfile(userRepository, auctionRepository),
  );
  const authController = new AuthController(
    new LoginUser(userRepository, passwordHasher, accessTokenService),
  );
  const authenticate = createAuthenticationMiddleware(accessTokenService);

  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/api/users', createUserRouter(userController, authenticate));
  app.use('/api/auth', createAuthRouter(authController));
  app.use(
    '/api/auctions',
    createAuctionRouter(auctionController, authenticate),
  );
  app.use('/api/payments', createPaymentRouter(paymentController));
  app.use(
    '/api/payment-orders',
    createPaymentOrderRouter(paymentOrderController, authenticate),
  );
  app.use(createErrorMiddleware(logger));

  return app;
}

function createDefaultAccessTokenService(): AccessTokenService {
  if (process.env.NODE_ENV === 'test') {
    return new JwtAccessTokenService(
      'test-only-authentication-secret-32-characters',
      3600,
    );
  }
  const config = loadAuthenticationConfig(process.env);
  return new JwtAccessTokenService(
    config.tokenSecret,
    config.tokenExpiresInSeconds,
  );
}

function createDevelopmentVerifier(): PaymentNotificationVerifier {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'El verificador simulado de pagos no está permitido en producción.',
    );
  }
  return new DevelopmentOnlyPaymentNotificationVerifier(
    process.env.SIMULATED_PAYMENT_WEBHOOK_SECRET ??
      'development-only-payment-webhook-secret',
  );
}
