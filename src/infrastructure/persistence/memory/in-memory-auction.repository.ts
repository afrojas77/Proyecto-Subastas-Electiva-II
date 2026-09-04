import type { Auction } from '../../../domain/entities/auction';
import type { AuctionRepository } from '../../../domain/ports/auction.repository';

export class InMemoryAuctionRepository implements AuctionRepository {
  private readonly auctions = new Map<string, Auction>();

  findById(id: string): Promise<Auction | undefined> {
    return Promise.resolve(this.auctions.get(id));
  }

  findAll(): Promise<readonly Auction[]> {
    return Promise.resolve([...this.auctions.values()]);
  }

  save(auction: Auction): Promise<void> {
    this.auctions.set(auction.id, auction);
    return Promise.resolve();
  }
}
