import express from 'express';

import { CancelAuction } from './application/use-cases/cancel-auction';
import { CloseAuction } from './application/use-cases/close-auction';
import { GetAuctionBidHistory } from './application/use-cases/get-auction-bid-history';
import { GetAuction } from './application/use-cases/get-auction';
import { ListAuctions } from './application/use-cases/list-auctions';
import { PlaceBid } from './application/use-cases/place-bid';
import { ProcessPaymentNotification } from './application/use-cases/process-payment-notification';
import { PublishAuction } from './application/use-cases/publish-auction';
import type { PaymentNotificationVerifier } from './application/ports/payment-notification-verifier';
import type { RealtimeEventPublisher } from './application/ports/realtime-event-publisher';
import type { AuctionRepository } from './domain/ports/auction.repository';
import type { Clock } from './domain/ports/clock';
import type { PaymentEventRepository } from './domain/ports/payment-event.repository';
import type { PaymentOrderRepository } from './domain/ports/payment-order.repository';
import { AuctionController } from './infrastructure/http/controllers/auction.controller';
import { PaymentController } from './infrastructure/http/controllers/payment.controller';
import { healthRouter } from './infrastructure/http/routes/health.routes';
import { createErrorMiddleware } from './infrastructure/http/middlewares/error.middleware';
import { createAuctionRouter } from './infrastructure/http/routes/auction.routes';
import { createPaymentRouter } from './infrastructure/http/routes/payment.routes';
import { ConsoleLogger } from './infrastructure/logging/console-logger';
import { DevelopmentOnlyPaymentNotificationVerifier } from './infrastructure/payments/development-only-payment-notification-verifier';
import { InMemoryAuctionRepository } from './infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentEventRepository } from './infrastructure/persistence/memory/in-memory-payment-event.repository';
import { InMemoryPaymentOrderRepository } from './infrastructure/persistence/memory/in-memory-payment-order.repository';
import { SystemClock } from './infrastructure/time/system-clock';

export interface AppDependencies {
  realtimeEventPublisher: RealtimeEventPublisher;
  auctionRepository?: AuctionRepository;
  clock?: Clock;
  paymentEventRepository?: PaymentEventRepository;
  paymentNotificationVerifier?: PaymentNotificationVerifier;
  paymentOrderRepository?: PaymentOrderRepository;
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
  const logger = new ConsoleLogger();
  const auctionController = new AuctionController(
    new PublishAuction(auctionRepository, clock),
    new GetAuction(auctionRepository),
    new ListAuctions(auctionRepository),
    new CancelAuction(auctionRepository),
    new PlaceBid(
      auctionRepository,
      clock,
      dependencies.realtimeEventPublisher,
    ),
    new GetAuctionBidHistory(auctionRepository),
    new CloseAuction(
      auctionRepository,
      clock,
      paymentOrderRepository,
      dependencies.realtimeEventPublisher,
    ),
    logger,
  );
  const paymentController = new PaymentController(
    new ProcessPaymentNotification(
      paymentNotificationVerifier,
      paymentOrderRepository,
      paymentEventRepository,
      dependencies.realtimeEventPublisher,
    ),
  );

  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/api/auctions', createAuctionRouter(auctionController));
  app.use('/api/payments', createPaymentRouter(paymentController));
  app.use(createErrorMiddleware(logger));

  return app;
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
