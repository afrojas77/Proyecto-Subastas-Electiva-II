import type { AuctionClosure } from '../../domain/value-objects/auction-closure';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import { GetAuction } from './get-auction';

export class CloseAuction {
  private readonly getAuction: GetAuction;

  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
    private readonly paymentOrderRepository: PaymentOrderRepository,
  ) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(auctionId: string): Promise<AuctionClosure> {
    const auction = await this.getAuction.execute(auctionId);
    const closure = auction.close({
      closedAt: this.clock.now(),
      paymentOrderId: `payment-${auction.id}`,
    });
    await this.auctionRepository.save(auction);
    if (closure.paymentOrder) {
      await this.paymentOrderRepository.save(closure.paymentOrder);
    }
    return closure;
  }
}
