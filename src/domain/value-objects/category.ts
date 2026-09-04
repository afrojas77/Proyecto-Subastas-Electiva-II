import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';

export class Category {
  public readonly name: string;

  constructor(name: string) {
    this.name = name.trim();
    if (!this.name) {
      throw new InvalidDomainValueError('La categoría requiere un nombre.');
    }
    Object.freeze(this);
  }

  equals(other: Category): boolean {
    return this.name === other.name;
  }
}
