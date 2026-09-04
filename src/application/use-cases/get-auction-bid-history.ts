import type { Bid } from '../../domain/entities/bid';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { GetAuction } from './get-auction';

export interface AuctionBidHistory {
  auctionId: string;
  bids: readonly Bid[];
}

export class GetAuctionBidHistory {
  private readonly getAuction: GetAuction;

  constructor(auctionRepository: AuctionRepository) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(auctionId: string): Promise<AuctionBidHistory> {
    const auction = await this.getAuction.execute(auctionId);
    return { auctionId: auction.id, bids: auction.acceptedBids };
  }
}
