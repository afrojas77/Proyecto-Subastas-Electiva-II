import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import type { ProcessAuctionClosure } from './process-auction-closure';

export class GetAuction {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly processAuctionClosure?: ProcessAuctionClosure,
  ) {}

  async execute(id: string): Promise<Auction> {
    const auction = await this.auctionRepository.findById(id);
    if (!auction) {
      throw new ResourceNotFoundError('Subasta', id);
    }
    await this.processAuctionClosure?.executeIfDue(auction);
    return auction;
  }
}
