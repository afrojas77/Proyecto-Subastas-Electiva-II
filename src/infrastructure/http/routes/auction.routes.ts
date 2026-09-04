import { Router } from 'express';

import type { AuctionController } from '../controllers/auction.controller';

export function createAuctionRouter(controller: AuctionController): Router {
  const router = Router();

  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.publish);
  router.post('/:id/bids', controller.placeBid);
  router.get('/:id/bids', controller.bidHistory);
  router.post('/:id/cancel', controller.cancel);
  router.post('/:id/close', controller.close);

  return router;
}
