import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';

export class ListAuctions {
  constructor(private readonly auctionRepository: AuctionRepository) {}

  execute(): Promise<readonly Auction[]> {
    return this.auctionRepository.findAll();
  }
}
