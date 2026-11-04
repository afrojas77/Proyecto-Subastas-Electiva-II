import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { PaymentEventRepository } from '../../domain/ports/payment-event.repository';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';

export interface TransactionRepositories {
  auctionRepository: AuctionRepository;
  paymentEventRepository: PaymentEventRepository;
  paymentOrderRepository: PaymentOrderRepository;
}

export interface PersistenceTransaction {
  execute<Result>(
    lockKeys: readonly string[],
    work: (repositories: TransactionRepositories) => Promise<Result>,
  ): Promise<Result>;
}
