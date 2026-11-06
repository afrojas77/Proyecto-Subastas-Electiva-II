import { Router, type RequestHandler } from 'express';

import type { AuctionController } from '../controllers/auction.controller';

export function createAuctionRouter(
  controller: AuctionController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.get('/', controller.list);
  router.get('/:id', authenticate, controller.get);
  router.post('/', authenticate, controller.publish);
  router.post('/:id/bids', authenticate, controller.placeBid);
  router.get('/:id/bids', authenticate, controller.bidHistory);
  router.post('/:id/cancel', authenticate, controller.cancel);
  router.post('/:id/close', authenticate, controller.close);

  return router;
}
