import { BidRejectedError } from '../../domain/errors/bid-rejected.error';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import { Money } from '../../domain/value-objects/money';
import type { Bid } from '../../domain/entities/bid';
import { GetAuction } from './get-auction';

export interface PlaceBidCommand {
  id: string;
  auctionId: string;
  bidderId: string;
  amount: number;
}

export class PlaceBid {
  private readonly getAuction: GetAuction;

  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
  ) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(command: PlaceBidCommand): Promise<Bid> {
    const auction = await this.getAuction.execute(command.auctionId);

    try {
      const bid = auction.receiveBid({
        id: command.id,
        bidderId: command.bidderId,
        amount: new Money(command.amount),
        placedAt: this.clock.now(),
      });
      await this.auctionRepository.save(auction);
      return bid;
    } catch (error: unknown) {
      if (error instanceof BidRejectedError) {
        await this.auctionRepository.save(auction);
      }
      throw error;
    }
  }
}
