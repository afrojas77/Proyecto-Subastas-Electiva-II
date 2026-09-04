import { DomainError } from './domain.error';

export class InvalidAuctionStateError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_AUCTION_STATE');
  }
}
