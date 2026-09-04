import type { Request, Response } from 'express';

import { CancelAuction } from '../../../application/use-cases/cancel-auction';
import { CloseAuction } from '../../../application/use-cases/close-auction';
import { GetAuctionBidHistory } from '../../../application/use-cases/get-auction-bid-history';
import { GetAuction } from '../../../application/use-cases/get-auction';
import { ListAuctions } from '../../../application/use-cases/list-auctions';
import { PlaceBid } from '../../../application/use-cases/place-bid';
import { PublishAuction } from '../../../application/use-cases/publish-auction';
import { ConsoleLogger } from '../../logging/console-logger';
import {
  requireBody,
  requireDate,
  requireNumber,
  requireRouteId,
  requireString,
} from '../request-helpers';
import {
  presentAuction,
  presentAuctionClosure,
  presentBid,
} from '../presenters/auction.presenter';

export class AuctionController {
  constructor(
    private readonly publishAuction: PublishAuction,
    private readonly getAuction: GetAuction,
    private readonly listAuctions: ListAuctions,
    private readonly cancelAuction: CancelAuction,
    private readonly placeBidUseCase: PlaceBid,
    private readonly getAuctionBidHistory: GetAuctionBidHistory,
    private readonly closeAuction: CloseAuction,
    private readonly logger: ConsoleLogger,
  ) {}

  publish = async (request: Request, response: Response): Promise<void> => {
    const body = requireBody(request.body as unknown);
    const article = requireBody(body.article);
    const auction = await this.publishAuction.execute({
      id: requireString(body, 'id'),
      sellerId: requireString(body, 'sellerId'),
      article: {
        denomination: requireString(article, 'denomination'),
        description: requireString(article, 'description'),
        conservationState: requireString(article, 'conservationState') as
          'NEW' | 'LIKE_NEW' | 'USED' | 'RESTORED',
      },
      category: requireString(body, 'category'),
      basePrice: requireNumber(body, 'basePrice'),
      minimumIncrement: requireNumber(body, 'minimumIncrement'),
      closesAt: requireDate(body, 'closesAt'),
    });
    this.logger.info('Subasta publicada', { auctionId: auction.id });
    response.status(201).json(presentAuction(auction));
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const auction = await this.getAuction.execute(
      requireRouteId(request.params.id),
    );
    response.status(200).json(presentAuction(auction));
  };

  list = async (_request: Request, response: Response): Promise<void> => {
    const auctions = await this.listAuctions.execute();
    response.status(200).json({ auctions: auctions.map(presentAuction) });
  };

  cancel = async (request: Request, response: Response): Promise<void> => {
    const auction = await this.cancelAuction.execute(
      requireRouteId(request.params.id),
    );
    response.status(200).json(presentAuction(auction));
  };

  placeBid = async (request: Request, response: Response): Promise<void> => {
    const body = requireBody(request.body as unknown);
    const auctionId = requireRouteId(request.params.id);
    const bid = await this.placeBidUseCase.execute({
      id: requireString(body, 'id'),
      auctionId,
      bidderId: requireString(body, 'bidderId'),
      amount: requireNumber(body, 'amount'),
    });
    this.logger.info('Puja aceptada', {
      auctionId,
      bidId: bid.id,
    });
    response.status(201).json(presentBid(bid));
  };

  bidHistory = async (request: Request, response: Response): Promise<void> => {
    const history = await this.getAuctionBidHistory.execute(
      requireRouteId(request.params.id),
    );
    response.status(200).json({
      auctionId: history.auctionId,
      bids: history.bids.map(presentBid),
    });
  };

  close = async (request: Request, response: Response): Promise<void> => {
    const auctionId = requireRouteId(request.params.id);
    const closure = await this.closeAuction.execute(auctionId);
    this.logger.info('Subasta cerrada', { auctionId });
    response.status(200).json(presentAuctionClosure(closure));
  };
}
