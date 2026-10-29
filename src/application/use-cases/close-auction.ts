import type { AuctionClosure } from '../../domain/value-objects/auction-closure';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';
import { GetAuction } from './get-auction';

export class CloseAuction {
  private readonly getAuction: GetAuction;

  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
    private readonly paymentOrderRepository: PaymentOrderRepository,
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
  ) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(auctionId: string): Promise<AuctionClosure> {
    const auction = await this.getAuction.execute(auctionId);
    const wasAlreadyClosed = auction.closure !== undefined;
    const closedAt = this.clock.now();
    const closure = auction.close({
      closedAt,
      paymentOrderId: `payment-${auction.id}`,
    });
    await this.auctionRepository.save(auction);
    if (closure.paymentOrder) {
      await this.paymentOrderRepository.save(closure.paymentOrder);
    }
    if (!wasAlreadyClosed) {
      await this.realtimeEventPublisher.publish({
        type: 'auction:closed',
        auctionId: closure.auctionId,
        status: closure.paymentOrder ? 'CLOSED' : 'DESERTED',
        closedAt: closedAt.toISOString(),
        winnerId: closure.winnerId,
        paymentOrderId: closure.paymentOrder?.id,
        winningAmount: closure.winningBid?.amount.amount,
      });
    }
    return closure;
  }
}
