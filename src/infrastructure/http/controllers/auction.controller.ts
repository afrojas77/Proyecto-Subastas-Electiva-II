import type { Request, Response } from 'express';

import { CancelAuction } from '../../../application/use-cases/cancel-auction';
import { CloseAuction } from '../../../application/use-cases/close-auction';
import { GetAuctionBidHistory } from '../../../application/use-cases/get-auction-bid-history';
import { GetAuction } from '../../../application/use-cases/get-auction';
import { ListAuctions } from '../../../application/use-cases/list-auctions';
import { PlaceBid } from '../../../application/use-cases/place-bid';
import { PublishAuction } from '../../../application/use-cases/publish-auction';
import { ConsoleLogger } from '../../logging/console-logger';
import { getAuthenticatedUserId } from '../authentication-request';
import {
  rejectField,
  optionalPositiveInteger,
  optionalQueryString,
  requireBody,
  requireDate,
  requireNumber,
  requireRouteId,
  requireString,
} from '../request-helpers';
import {
  presentAuction,
  presentAuctionDetail,
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
    rejectField(body, 'sellerId');
    const article = requireBody(body.article);
    const auction = await this.publishAuction.execute({
      id: requireString(body, 'id'),
      sellerId: getAuthenticatedUserId(request),
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
    response.status(200).json(presentAuctionDetail(auction));
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const result = await this.listAuctions.execute({
      category: optionalQueryString(request.query.category, 'category'),
      status: optionalQueryString(request.query.status, 'status'),
      page: optionalPositiveInteger(request.query.page, 'page'),
      limit: optionalPositiveInteger(request.query.limit, 'limit'),
    });
    response.status(200).json({
      auctions: result.auctions.map(presentAuction),
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  };

  cancel = async (request: Request, response: Response): Promise<void> => {
    const auction = await this.cancelAuction.execute({
      auctionId: requireRouteId(request.params.id),
      requesterId: getAuthenticatedUserId(request),
    });
    response.status(200).json(presentAuction(auction));
  };

  placeBid = async (request: Request, response: Response): Promise<void> => {
    const body = requireBody(request.body as unknown);
    rejectField(body, 'bidderId');
    const auctionId = requireRouteId(request.params.id);
    const bid = await this.placeBidUseCase.execute({
      id: requireString(body, 'id'),
      auctionId,
      bidderId: getAuthenticatedUserId(request),
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
    const closure = await this.closeAuction.execute({
      auctionId,
      requesterId: getAuthenticatedUserId(request),
    });
    this.logger.info('Subasta cerrada', { auctionId });
    response.status(200).json(presentAuctionClosure(closure));
  };
}
