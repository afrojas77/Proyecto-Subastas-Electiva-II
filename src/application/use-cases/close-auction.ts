import type { AuctionClosure } from '../../domain/value-objects/auction-closure';
import type { AuctionRepository } from '../../domain/ports/auction.repository';
import { AuthorizationError } from '../errors/authorization.error';
import { GetAuction } from './get-auction';
import type { ProcessAuctionClosure } from './process-auction-closure';

export interface CloseAuctionCommand {
  readonly auctionId: string;
  readonly requesterId: string;
}

export class CloseAuction {
  private readonly getAuction: GetAuction;

  constructor(
    auctionRepository: AuctionRepository,
    private readonly processAuctionClosure: ProcessAuctionClosure,
  ) {
    this.getAuction = new GetAuction(auctionRepository);
  }

  async execute(command: CloseAuctionCommand): Promise<AuctionClosure> {
    const auction = await this.getAuction.execute(command.auctionId);
    if (auction.sellerId !== command.requesterId) {
      throw new AuthorizationError(
        'Sólo el vendedor puede cerrar manualmente esta subasta.',
      );
    }
    return this.processAuctionClosure.execute(auction);
  }
}
