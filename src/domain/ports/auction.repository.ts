import type { Auction } from '../entities/auction';
import type { AuctionStatusValue } from '../value-objects/auction-status';

export interface AuctionPageQuery {
  category?: string;
  status?: AuctionStatusValue;
  page: number;
  limit: number;
}

export interface AuctionPage {
  items: readonly Auction[];
  total: number;
}

export interface AuctionRepository {
  findById(id: string): Promise<Auction | undefined>;
  findPage(query: AuctionPageQuery): Promise<AuctionPage>;
  save(auction: Auction): Promise<void>;
}
