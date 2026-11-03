export type RealtimeEvent =
  | {
      type: 'auction:bid-accepted';
      auctionId: string;
      bidId: string;
      bidderId: string;
      amount: number;
      placedAt: string;
      sequence: number;
    }
  | {
      type: 'auction:bid-outbid';
      auctionId: string;
      recipientUserId: string;
      newBidId: string;
      currentAmount: number;
      occurredAt: string;
    }
  | {
      type: 'auction:closed';
      auctionId: string;
      status: 'CLOSED' | 'DESERTED';
      closedAt: string;
      winnerId?: string;
      paymentOrderId?: string;
      winningAmount?: number;
    }
  | {
      type: 'auction:result';
      auctionId: string;
      recipientUserId: string;
      recipientRole: 'WINNER' | 'SELLER';
      status: 'CLOSED' | 'DESERTED';
      closedAt: string;
      winnerId?: string;
      paymentOrderId?: string;
      winningAmount?: number;
    }
  | {
      type: 'payment:confirmed';
      auctionId: string;
      paymentOrderId: string;
      paymentEventId: string;
      occurredAt: string;
      orderStatus: 'PAID';
    }
  | {
      type: 'auction:defaulted';
      auctionId: string;
      paymentOrderId: string;
      dueAt: string;
      orderStatus: 'EXPIRED';
      auctionStatus: 'DEFAULTED';
    };

export interface RealtimeEventPublisher {
  publish(event: RealtimeEvent): Promise<void>;
}
