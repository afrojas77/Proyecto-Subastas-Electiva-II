import express from 'express';

import { CancelAuction } from './application/use-cases/cancel-auction';
import { CloseAuction } from './application/use-cases/close-auction';
import { GetAuctionBidHistory } from './application/use-cases/get-auction-bid-history';
import { GetAuction } from './application/use-cases/get-auction';
import { ListAuctions } from './application/use-cases/list-auctions';
import { PlaceBid } from './application/use-cases/place-bid';
import { PublishAuction } from './application/use-cases/publish-auction';
import type { AuctionRepository } from './domain/ports/auction.repository';
import type { Clock } from './domain/ports/clock';
import type { PaymentOrderRepository } from './domain/ports/payment-order.repository';
import { AuctionController } from './infrastructure/http/controllers/auction.controller';
import { healthRouter } from './infrastructure/http/routes/health.routes';
import { createErrorMiddleware } from './infrastructure/http/middlewares/error.middleware';
import { createAuctionRouter } from './infrastructure/http/routes/auction.routes';
import { ConsoleLogger } from './infrastructure/logging/console-logger';
import { InMemoryAuctionRepository } from './infrastructure/persistence/memory/in-memory-auction.repository';
import { InMemoryPaymentOrderRepository } from './infrastructure/persistence/memory/in-memory-payment-order.repository';
import { SystemClock } from './infrastructure/time/system-clock';

export interface AppDependencies {
  auctionRepository?: AuctionRepository;
  clock?: Clock;
  paymentOrderRepository?: PaymentOrderRepository;
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const auctionRepository =
    dependencies.auctionRepository ?? new InMemoryAuctionRepository();
  const clock = dependencies.clock ?? new SystemClock();
  const paymentOrderRepository =
    dependencies.paymentOrderRepository ?? new InMemoryPaymentOrderRepository();
  const logger = new ConsoleLogger();
  const controller = new AuctionController(
    new PublishAuction(auctionRepository, clock),
    new GetAuction(auctionRepository),
    new ListAuctions(auctionRepository),
    new CancelAuction(auctionRepository),
    new PlaceBid(auctionRepository, clock),
    new GetAuctionBidHistory(auctionRepository),
    new CloseAuction(auctionRepository, clock, paymentOrderRepository),
    logger,
  );

  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/api/auctions', createAuctionRouter(controller));
  app.use(createErrorMiddleware(logger));

  return app;
}

export const app = createApp();
