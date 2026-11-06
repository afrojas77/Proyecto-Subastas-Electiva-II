import { AuthenticationRequiredError } from '../errors/authentication-required.error';
import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { UserRepository } from '../../domain/ports/user.repository';
import { toUserProfile, type UserProfile } from './user-profile';

export interface ProfileAuctionSummary {
  readonly id: string;
  readonly category: string;
  readonly status: string;
  readonly closesAt: string;
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
      publishedAuctions: Object.freeze(publishedAuctions.map(toSummary)),
      participatedAuctions: Object.freeze(participatedAuctions.map(toSummary)),
    });
  }
}

function toSummary(auction: Auction): ProfileAuctionSummary {
  return Object.freeze({
    id: auction.id,
    category: auction.category.name,
    status: auction.status.value,
    closesAt: auction.closesAt.toISOString(),
  });
}
