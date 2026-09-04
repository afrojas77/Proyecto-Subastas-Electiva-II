import type { Auction } from '../entities/auction';

export interface AuctionRepository {
  findById(id: string): Promise<Auction | undefined>;
  save(auction: Auction): Promise<void>;
}
