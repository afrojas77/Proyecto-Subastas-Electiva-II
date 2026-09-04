import { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import type { Clock } from '../../domain/ports/clock';
import {
  Article,
  type ConservationState,
} from '../../domain/value-objects/article';
import { Category } from '../../domain/value-objects/category';
import { Money } from '../../domain/value-objects/money';

export interface PublishAuctionCommand {
  id: string;
  sellerId: string;
  article: {
    denomination: string;
    description: string;
    conservationState: ConservationState;
  };
  category: string;
  basePrice: number;
  minimumIncrement: number;
  closesAt: Date;
}

export class PublishAuction {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PublishAuctionCommand): Promise<Auction> {
    const auction = Auction.publish(
      {
        id: command.id,
        sellerId: command.sellerId,
        article: new Article(
          command.article.denomination,
          command.article.description,
          command.article.conservationState,
        ),
        category: new Category(command.category),
        basePrice: new Money(command.basePrice),
        minimumIncrement: new Money(command.minimumIncrement),
        closesAt: command.closesAt,
      },
      this.clock,
    );

    await this.auctionRepository.save(auction);
    return auction;
  }
}
