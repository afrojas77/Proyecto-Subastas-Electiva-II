import type { Auction } from '../../../domain/entities/auction';
import type {
  AuctionPage,
  AuctionPageQuery,
  AuctionRepository,
} from '../../../domain/ports/auction.repository';

export class InMemoryAuctionRepository implements AuctionRepository {
  private readonly auctions = new Map<string, Auction>();

  findById(id: string): Promise<Auction | undefined> {
    return Promise.resolve(this.auctions.get(id));
  }

  findPage(query: AuctionPageQuery): Promise<AuctionPage> {
    const filtered = [...this.auctions.values()]
      .filter(
        (auction) =>
          !query.category || auction.category.name === query.category,
      )
      .filter(
        (auction) =>
          !query.status || auction.status.value === query.status,
      )
      .sort(
        (left, right) =>
          left.publishedAt.getTime() - right.publishedAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    const offset = (query.page - 1) * query.limit;
    return Promise.resolve({
      items: filtered.slice(offset, offset + query.limit),
      total: filtered.length,
    });
  }

  save(auction: Auction): Promise<void> {
    this.auctions.set(auction.id, auction);
    return Promise.resolve();
  }
}
