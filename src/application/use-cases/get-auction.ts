import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';

export class GetAuction {
  constructor(private readonly auctionRepository: AuctionRepository) {}

  async execute(id: string): Promise<Auction> {
    const auction = await this.auctionRepository.findById(id);
    if (!auction) {
      throw new ResourceNotFoundError('Subasta', id);
    }
    return auction;
  }
}
