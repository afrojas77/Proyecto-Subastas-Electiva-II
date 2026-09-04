import type { RejectedBidReason } from '../entities/rejected-bid-attempt';
import { DomainError } from './domain.error';

export class BidRejectedError extends DomainError {
  constructor(public readonly reason: RejectedBidReason) {
    super(`La puja fue rechazada: ${reason}`, reason);
  }
}
