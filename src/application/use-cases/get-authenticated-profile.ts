import { AuthenticationRequiredError } from '../errors/authentication-required.error';
import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { UserRepository } from '../../domain/ports/user.repository';
import { toUserProfile, type UserProfile } from './user-profile';

export interface ProfileAuctionSummary {
  readonly id: string;
  readonly sellerId: string;
  readonly article: {
    readonly denomination: string;
    readonly description: string;
    readonly conservationState: string;
  };
  readonly category: string;
  readonly basePrice: number;
  readonly minimumIncrement: number;
  readonly publishedAt: string;
  readonly status: string;
  readonly closesAt: string;
  readonly winnerId?: string;
  readonly highestBid?: {
    readonly bidderId: string;
    readonly amount: number;
  };
  readonly userLastBid?: {
    readonly amount: number;
    readonly placedAt: string;
  };
}

export interface AuthenticatedProfile extends UserProfile {
  readonly publishedAuctions: readonly ProfileAuctionSummary[];
  readonly participatedAuctions: readonly ProfileAuctionSummary[];
}

export class GetAuthenticatedProfile {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly auctionRepository: AuctionRepository,
  ) {}

  async execute(userId: string): Promise<AuthenticatedProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationRequiredError();
    }
    const [publishedAuctions, participatedAuctions] = await Promise.all([
      this.auctionRepository.findBySellerId(userId),
      this.auctionRepository.findByBidderId(userId),
    ]);
    return Object.freeze({
      ...toUserProfile(user),
      publishedAuctions: Object.freeze(
        publishedAuctions.map((auction) => toSummary(auction)),
      ),
      participatedAuctions: Object.freeze(
        participatedAuctions.map((auction) => toSummary(auction, userId)),
      ),
    });
  }
}

function toSummary(
  auction: Auction,
  participantUserId?: string,
): ProfileAuctionSummary {
  const highestBid = auction.highestBid;
  const userLastBid = participantUserId
    ? auction.acceptedBids
        .filter((bid) => bid.bidderId === participantUserId)
        .at(-1)
    : undefined;
  return Object.freeze({
    id: auction.id,
    sellerId: auction.sellerId,
    article: Object.freeze({
      denomination: auction.article.denomination,
      description: auction.article.description,
      conservationState: auction.article.conservationState,
    }),
    category: auction.category.name,
    basePrice: auction.basePrice.amount,
    minimumIncrement: auction.minimumIncrement.amount,
    publishedAt: auction.publishedAt.toISOString(),
    status: auction.status.value,
    closesAt: auction.closesAt.toISOString(),
    winnerId: auction.winnerId,
    highestBid: highestBid
      ? Object.freeze({
          bidderId: highestBid.bidderId,
          amount: highestBid.amount.amount,
        })
      : undefined,
    userLastBid: userLastBid
      ? Object.freeze({
          amount: userLastBid.amount.amount,
          placedAt: userLastBid.placedAt.toISOString(),
        })
      : undefined,
  });
}
