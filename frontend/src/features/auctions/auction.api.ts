import { apiRequest } from '../../lib/api-client';

export interface AuctionSummary {
  id: string;
  sellerId: string;
  article: {
    denomination: string;
    description: string;
    conservationState: 'NEW' | 'LIKE_NEW' | 'USED' | 'RESTORED';
  };
  category: string;
  basePrice: number;
  minimumIncrement: number;
  publishedAt: string;
  closesAt: string;
  status: string;
  winnerId?: string;
  highestBid?: {
    bidderId: string;
    amount: number;
  } | null;
  userLastBid?: {
    amount: number;
    placedAt: string;
  };
}

export interface BidSummary {
  id: string;
  bidderId: string;
  amount: number;
  placedAt: string;
  sequence: number;
}

export interface AuctionDetail extends AuctionSummary {
  highestBid: BidSummary | null;
  bids: BidSummary[];
}

interface AuctionPage {
  auctions: AuctionSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PublishAuctionData {
  article: {
    denomination: string;
    description: string;
    conservationState: AuctionSummary['article']['conservationState'];
  };
  category: string;
  basePrice: number;
  minimumIncrement: number;
  closesAt: string;
}

export function listLiveAuctions(): Promise<AuctionPage> {
  return apiRequest<AuctionPage>('/api/auctions?status=OPEN&limit=100');
}

export function publishAuction(
  data: PublishAuctionData,
  accessToken: string,
): Promise<AuctionSummary> {
  return apiRequest<AuctionSummary>('/api/auctions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id: crypto.randomUUID(), ...data }),
  });
}

export function getMyAuctionActivity(accessToken: string): Promise<{
  publishedAuctions: AuctionSummary[];
  participatedAuctions: AuctionSummary[];
}> {
  return apiRequest<{
    publishedAuctions: AuctionSummary[];
    participatedAuctions: AuctionSummary[];
  }>('/api/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getAuctionDetail(
  auctionId: string,
  accessToken: string,
): Promise<AuctionDetail> {
  return apiRequest<AuctionDetail>(`/api/auctions/${auctionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function placeBid(
  auctionId: string,
  amount: number,
  accessToken: string,
): Promise<BidSummary> {
  return apiRequest<BidSummary>(`/api/auctions/${auctionId}/bids`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id: crypto.randomUUID(), amount }),
  });
}
