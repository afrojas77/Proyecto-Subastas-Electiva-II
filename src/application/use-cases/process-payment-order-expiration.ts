import type { Auction } from '../../domain/entities/auction';
import type { PaymentOrder } from '../../domain/entities/payment-order';
import { InvalidAuctionStateError } from '../../domain/errors/invalid-auction-state.error';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';

export type ProcessPaymentOrderExpirationResult =
  | {
      outcome: 'PROCESSED';
      paymentOrderId: string;
      auctionId: string;
      orderStatus: 'EXPIRED';
      auctionStatus: 'DEFAULTED';
    }
  | {
      outcome: 'NOT_DUE';
      paymentOrderId: string;
      auctionId: string;
      orderStatus: 'PENDING';
    }
  | {
      outcome: 'PAID';
      paymentOrderId: string;
      auctionId: string;
      orderStatus: 'PAID';
    }
  | {
      outcome: 'ALREADY_PROCESSED';
      paymentOrderId: string;
      auctionId: string;
      orderStatus: 'EXPIRED';
      auctionStatus: 'DEFAULTED';
    };

export class ProcessPaymentOrderExpiration {
  constructor(
    private readonly paymentOrderRepository: PaymentOrderRepository,
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
  ) {}

  async execute(
    paymentOrderId: string,
  ): Promise<ProcessPaymentOrderExpirationResult> {
    const paymentOrder =
      await this.paymentOrderRepository.findById(paymentOrderId);
    if (!paymentOrder) {
      throw new ResourceNotFoundError('Orden de pago', paymentOrderId);
    }

    if (paymentOrder.status === 'PAID') {
      return this.resultForTerminalOrder('PAID', paymentOrder);
    }

    if (paymentOrder.status === 'EXPIRED') {
      const auction = await this.findAuction(paymentOrder.auctionId);
      this.assertAlreadyProcessed(paymentOrder, auction);
      return {
        outcome: 'ALREADY_PROCESSED',
        paymentOrderId: paymentOrder.id,
        auctionId: paymentOrder.auctionId,
        orderStatus: 'EXPIRED',
        auctionStatus: 'DEFAULTED',
      };
    }

    const evaluatedAt = this.clock.now();
    if (evaluatedAt.getTime() < paymentOrder.dueAt.getTime()) {
      return {
        outcome: 'NOT_DUE',
        paymentOrderId: paymentOrder.id,
        auctionId: paymentOrder.auctionId,
        orderStatus: 'PENDING',
      };
    }

    const auction = await this.findAuction(paymentOrder.auctionId);
    paymentOrder.expire(evaluatedAt);
    auction.markAsDefaulted(paymentOrder);

    await this.paymentOrderRepository.save(paymentOrder);
    await this.auctionRepository.save(auction);
    await this.realtimeEventPublisher.publish({
      type: 'auction:defaulted',
      auctionId: auction.id,
      paymentOrderId: paymentOrder.id,
      dueAt: paymentOrder.dueAt.toISOString(),
      orderStatus: 'EXPIRED',
      auctionStatus: 'DEFAULTED',
    });

    return {
      outcome: 'PROCESSED',
      paymentOrderId: paymentOrder.id,
      auctionId: paymentOrder.auctionId,
      orderStatus: 'EXPIRED',
      auctionStatus: 'DEFAULTED',
    };
  }

  private async findAuction(auctionId: string): Promise<Auction> {
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction) {
      throw new ResourceNotFoundError('Subasta', auctionId);
    }
    return auction;
  }

  private assertAlreadyProcessed(
    paymentOrder: PaymentOrder,
    auction: Auction,
  ): void {
    const closureOrder = auction.closure?.paymentOrder;
    if (
      !auction.status.equals(AuctionStatus.DEFAULTED) ||
      !auction.closure?.status.equals(AuctionStatus.DEFAULTED) ||
      !closureOrder ||
      closureOrder.id !== paymentOrder.id ||
      closureOrder.auctionId !== paymentOrder.auctionId ||
      closureOrder.debtorId !== paymentOrder.debtorId ||
      !closureOrder.amount.equals(paymentOrder.amount) ||
      closureOrder.status !== 'EXPIRED'
    ) {
      throw new InvalidAuctionStateError(
        'La orden vencida no tiene una subasta en incumplimiento coherente.',
      );
    }
  }

  private resultForTerminalOrder(
    outcome: 'PAID',
    paymentOrder: PaymentOrder,
  ): ProcessPaymentOrderExpirationResult {
    return {
      outcome,
      paymentOrderId: paymentOrder.id,
      auctionId: paymentOrder.auctionId,
      orderStatus: 'PAID',
    };
  }
}
