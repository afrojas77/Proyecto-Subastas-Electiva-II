import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';

export type ConservationState = 'NEW' | 'LIKE_NEW' | 'USED' | 'RESTORED';

const CONSERVATION_STATES: readonly ConservationState[] = [
  'NEW',
  'LIKE_NEW',
  'USED',
  'RESTORED',
];

export class Article {
  public readonly denomination: string;
  public readonly description: string;

  constructor(
    denomination: string,
    description: string,
    public readonly conservationState: ConservationState,
  ) {
    this.denomination = denomination.trim();
    this.description = description.trim();
    if (!this.denomination || !this.description) {
      throw new InvalidDomainValueError(
        'El artículo requiere denominación y descripción.',
      );
    }
    if (!CONSERVATION_STATES.includes(conservationState)) {
      throw new InvalidDomainValueError(
        `Estado de conservación no válido: ${conservationState}`,
      );
    }
    Object.freeze(this);
  }
}
