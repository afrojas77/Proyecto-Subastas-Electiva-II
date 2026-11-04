import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import type { AuctionClosure } from '../../domain/value-objects/auction-closure';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import type { PersistenceTransaction } from '../ports/persistence-transaction';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';

interface ClosureProcessingResult {
  auction: Auction;
  closure: AuctionClosure;
  transitioned: boolean;
}

export class ProcessAuctionClosure {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
    private readonly paymentOrderRepository: PaymentOrderRepository,
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
    private readonly persistenceTransaction?: PersistenceTransaction,
  ) {}

  async executeIfDue(auction: Auction): Promise<AuctionClosure | undefined> {
    if (!auction.status.equals(AuctionStatus.OPEN)) {
      return auction.closure;
    }
    const evaluatedAt = this.clock.now();
    if (evaluatedAt.getTime() < auction.closesAt.getTime()) {
      return undefined;
    }
    return this.close(auction.id, evaluatedAt);
  }

  async execute(auction: Auction): Promise<AuctionClosure> {
    return this.close(auction.id, this.clock.now());
  }

  private async close(
    auctionId: string,
    closedAt: Date,
  ): Promise<AuctionClosure> {
    const process = (
      auctionRepository: AuctionRepository,
      paymentOrderRepository: PaymentOrderRepository,
    ) =>
      this.persistClosure(
        auctionId,
        closedAt,
        auctionRepository,
        paymentOrderRepository,
      );
    const result = this.persistenceTransaction
      ? await this.persistenceTransaction.execute(
          [`auction:${auctionId}`],
          (repositories) =>
            process(
              repositories.auctionRepository,
              repositories.paymentOrderRepository,
            ),
        )
      : await process(this.auctionRepository, this.paymentOrderRepository);
    if (!result.transitioned) {
      return result.closure;
    }
    const { auction, closure } = result;
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

  private async persistClosure(
    auctionId: string,
    closedAt: Date,
    auctionRepository: AuctionRepository,
    paymentOrderRepository: PaymentOrderRepository,
  ): Promise<ClosureProcessingResult> {
    const auction = await auctionRepository.findById(auctionId);
    if (!auction) {
      throw new ResourceNotFoundError('Subasta', auctionId);
    }
    if (auction.closure) {
      return { auction, closure: auction.closure, transitioned: false };
    }
    const closure = auction.close({
      closedAt,
      paymentOrderId: `payment-${auction.id}`,
    });
    await auctionRepository.save(auction);
    if (closure.paymentOrder) {
      await paymentOrderRepository.save(closure.paymentOrder);
    }
    return { auction, closure, transitioned: true };
  }
}
