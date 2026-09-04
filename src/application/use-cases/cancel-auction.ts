import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { GetAuction } from './get-auction';

export class CancelAuction {
  private readonly getAuction: GetAuction;

  constructor(private readonly auctionRepository: AuctionRepository) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(id: string): Promise<Auction> {
    const auction = await this.getAuction.execute(id);
    auction.cancel();
    await this.auctionRepository.save(auction);
    return auction;
  }
}
