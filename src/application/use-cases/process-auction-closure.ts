import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import type { AuctionClosure } from '../../domain/value-objects/auction-closure';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';

export class ProcessAuctionClosure {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
    private readonly paymentOrderRepository: PaymentOrderRepository,
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
  ) {}

  async executeIfDue(auction: Auction): Promise<AuctionClosure | undefined> {
    if (!auction.status.equals(AuctionStatus.OPEN)) {
      return auction.closure;
    }
    const evaluatedAt = this.clock.now();
    if (evaluatedAt.getTime() < auction.closesAt.getTime()) {
      return undefined;
    }
    return this.close(auction, evaluatedAt);
  }

  async execute(auction: Auction): Promise<AuctionClosure> {
    return this.close(auction, this.clock.now());
  }

  private async close(
    auction: Auction,
    closedAt: Date,
  ): Promise<AuctionClosure> {
    if (auction.closure) {
      return auction.closure;
    }
    const closure = auction.close({
      closedAt,
      paymentOrderId: `payment-${auction.id}`,
    });
    await this.auctionRepository.save(auction);
    if (closure.paymentOrder) {
      await this.paymentOrderRepository.save(closure.paymentOrder);
    }
    await this.realtimeEventPublisher.publish({
      type: 'auction:closed',
      auctionId: closure.auctionId,
      status: closure.paymentOrder ? 'CLOSED' : 'DESERTED',
      closedAt: closedAt.toISOString(),
      winnerId: closure.winnerId,
      paymentOrderId: closure.paymentOrder?.id,
      winningAmount: closure.winningBid?.amount.amount,
    });
    if (closure.winnerId) {
      await this.realtimeEventPublisher.publish({
        type: 'auction:result',
        auctionId: closure.auctionId,
        recipientUserId: closure.winnerId,
        recipientRole: 'WINNER',
        status: 'CLOSED',
        closedAt: closedAt.toISOString(),
        winnerId: closure.winnerId,
        paymentOrderId: closure.paymentOrder?.id,
        winningAmount: closure.winningBid?.amount.amount,
      });
    }
    await this.realtimeEventPublisher.publish({
      type: 'auction:result',
      auctionId: closure.auctionId,
      recipientUserId: auction.sellerId,
      recipientRole: 'SELLER',
      status: closure.winnerId ? 'CLOSED' : 'DESERTED',
      closedAt: closedAt.toISOString(),
      winnerId: closure.winnerId,
      paymentOrderId: closure.paymentOrder?.id,
      winningAmount: closure.winningBid?.amount.amount,
    });
    return closure;
  }
}
