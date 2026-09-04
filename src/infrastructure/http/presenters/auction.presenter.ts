import type { Auction } from '../../../domain/entities/auction';
import type { Bid } from '../../../domain/entities/bid';
import type { AuctionClosure } from '../../../domain/value-objects/auction-closure';

export function presentAuction(auction: Auction): Record<string, unknown> {
  return {
    id: auction.id,
    sellerId: auction.sellerId,
    article: {
      denomination: auction.article.denomination,
      description: auction.article.description,
      conservationState: auction.article.conservationState,
    },
    category: auction.category.name,
    basePrice: auction.basePrice.amount,
    minimumIncrement: auction.minimumIncrement.amount,
    publishedAt: auction.publishedAt.toISOString(),
    closesAt: auction.closesAt.toISOString(),
    status: auction.status.value,
    winnerId: auction.winnerId,
  };
}

export function presentBid(bid: Bid): Record<string, unknown> {
  return {
    id: bid.id,
    bidderId: bid.bidderId,
    amount: bid.amount.amount,
    placedAt: bid.placedAt.toISOString(),
    sequence: bid.sequence,
  };
}

export function presentAuctionClosure(
  closure: AuctionClosure,
): Record<string, unknown> {
  return {
    auctionId: closure.auctionId,
    status: closure.status.value,
    winnerId: closure.winnerId,
    winningBid: closure.winningBid ? presentBid(closure.winningBid) : undefined,
    paymentOrder: closure.paymentOrder
      ? {
          id: closure.paymentOrder.id,
          debtorId: closure.paymentOrder.debtorId,
          amount: closure.paymentOrder.amount.amount,
          status: closure.paymentOrder.status,
          createdAt: closure.paymentOrder.createdAt.toISOString(),
          dueAt: closure.paymentOrder.dueAt.toISOString(),
        }
      : undefined,
  };
}
