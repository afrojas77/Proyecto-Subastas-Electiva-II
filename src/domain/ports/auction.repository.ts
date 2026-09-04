import type { Auction } from '../entities/auction';

export interface AuctionRepository {
  findById(id: string): Promise<Auction | undefined>;
  findAll(): Promise<readonly Auction[]>;
  save(auction: Auction): Promise<void>;
}
