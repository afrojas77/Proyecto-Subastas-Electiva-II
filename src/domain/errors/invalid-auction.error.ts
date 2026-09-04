import { DomainError } from './domain.error';

export class InvalidAuctionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_AUCTION');
  }
}
