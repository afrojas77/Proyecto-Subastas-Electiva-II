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

  findBySellerId(sellerId: string): Promise<readonly Auction[]> {
    return Promise.resolve(
      this.sortedAuctions().filter((auction) => auction.sellerId === sellerId),
    );
  }

  findByBidderId(bidderId: string): Promise<readonly Auction[]> {
    return Promise.resolve(
      this.sortedAuctions().filter((auction) =>
        auction.acceptedBids.some((bid) => bid.bidderId === bidderId),
      ),
    );
  }

  findPage(query: AuctionPageQuery): Promise<AuctionPage> {
    const filtered = this.sortedAuctions()
      .filter(
        (auction) =>
          !query.category || auction.category.name === query.category,
      )
      .filter(
        (auction) => !query.status || auction.status.value === query.status,
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

  private sortedAuctions(): Auction[] {
    return [...this.auctions.values()].sort(
      (left, right) =>
        left.publishedAt.getTime() - right.publishedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
  }
}
