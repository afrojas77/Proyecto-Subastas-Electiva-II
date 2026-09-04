import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';

export type AuctionStatusValue =
  'OPEN' | 'CANCELLED' | 'CLOSED' | 'DESERTED' | 'DEFAULTED';

export class AuctionStatus {
  static readonly OPEN = new AuctionStatus('OPEN');
  static readonly CANCELLED = new AuctionStatus('CANCELLED');
  static readonly CLOSED = new AuctionStatus('CLOSED');
  static readonly DESERTED = new AuctionStatus('DESERTED');
  static readonly DEFAULTED = new AuctionStatus('DEFAULTED');

  private constructor(public readonly value: AuctionStatusValue) {
    Object.freeze(this);
  }

  static from(value: string): AuctionStatus {
    const status = [
      AuctionStatus.OPEN,
      AuctionStatus.CANCELLED,
      AuctionStatus.CLOSED,
      AuctionStatus.DESERTED,
      AuctionStatus.DEFAULTED,
    ].find((candidate) => candidate.value === value);

    if (!status) {
      throw new InvalidDomainValueError(
        `Estado de subasta no válido: ${value}`,
      );
    }
    return status;
  }

  equals(other: AuctionStatus): boolean {
    return this.value === other.value;
  }
}
