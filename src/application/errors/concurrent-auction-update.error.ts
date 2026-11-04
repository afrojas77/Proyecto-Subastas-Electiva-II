export class ConcurrentAuctionUpdateError extends Error {
  readonly code = 'CONCURRENT_AUCTION_UPDATE';

  constructor(auctionId: string) {
    super(
      `La subasta ${auctionId} cambió mientras se procesaba la operación. Intente nuevamente.`,
    );
    this.name = 'ConcurrentAuctionUpdateError';
  }
}
