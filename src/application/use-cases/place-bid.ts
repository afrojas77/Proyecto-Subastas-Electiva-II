import { BidRejectedError } from '../../domain/errors/bid-rejected.error';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import { Money } from '../../domain/value-objects/money';
import type { Bid } from '../../domain/entities/bid';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';
import { GetAuction } from './get-auction';
import type { ProcessAuctionClosure } from './process-auction-closure';

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
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
    processAuctionClosure?: ProcessAuctionClosure,
  ) {
    this.getAuction = new GetAuction(auctionRepository, processAuctionClosure);
  }

  async execute(command: PlaceBidCommand): Promise<Bid> {
    const auction = await this.getAuction.execute(command.auctionId);
    const previousLeadingBid = auction.acceptedBids.at(-1);

    try {
      const bid = auction.receiveBid({
        id: command.id,
        bidderId: command.bidderId,
        amount: new Money(command.amount),
        placedAt: this.clock.now(),
      });
      await this.auctionRepository.save(auction);
      await this.realtimeEventPublisher.publish({
        type: 'auction:bid-accepted',
        auctionId: bid.auctionId,
        bidId: bid.id,
        bidderId: bid.bidderId,
        amount: bid.amount.amount,
        placedAt: bid.placedAt.toISOString(),
        sequence: bid.sequence,
      });
      if (
        previousLeadingBid &&
        previousLeadingBid.bidderId !== bid.bidderId
      ) {
        await this.realtimeEventPublisher.publish({
          type: 'auction:bid-outbid',
          auctionId: bid.auctionId,
          recipientUserId: previousLeadingBid.bidderId,
          newBidId: bid.id,
          currentAmount: bid.amount.amount,
          occurredAt: bid.placedAt.toISOString(),
        });
      }
      return bid;
    } catch (error: unknown) {
      if (error instanceof BidRejectedError) {
        await this.auctionRepository.save(auction);
      }
      throw error;
    }
  }
}
