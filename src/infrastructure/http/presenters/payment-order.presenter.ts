import type { PaymentOrder } from '../../../domain/entities/payment-order';

export function presentPaymentOrder(
  order: PaymentOrder,
): Record<string, unknown> {
  return {
    id: order.id,
    auctionId: order.auctionId,
    amount: order.amount.amount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    dueAt: order.dueAt.toISOString(),
  };
}
