import type { Auction } from '../../domain/entities/auction';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { AuthorizationError } from '../errors/authorization.error';
import { GetAuction } from './get-auction';

export interface CancelAuctionCommand {
  readonly auctionId: string;
  readonly requesterId: string;
}

export class CancelAuction {
  private readonly getAuction: GetAuction;

  constructor(private readonly auctionRepository: AuctionRepository) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(command: CancelAuctionCommand): Promise<Auction> {
    const auction = await this.getAuction.execute(command.auctionId);
    if (auction.sellerId !== command.requesterId) {
      throw new AuthorizationError(
        'Sólo el vendedor puede cancelar esta subasta.',
      );
    }
    auction.cancel();
    await this.auctionRepository.save(auction);
    return auction;
  }
}
