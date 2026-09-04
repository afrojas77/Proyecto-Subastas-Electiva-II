import { InvalidMoneyError } from '../errors/invalid-money.error';

export class Money {
  public readonly currency = 'COP' as const;

  constructor(public readonly amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new InvalidMoneyError(
        'El dinero debe expresarse en pesos colombianos enteros, seguros y no negativos.',
      );
    }
    Object.freeze(this);
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  isGreaterThanOrEqualTo(other: Money): boolean {
    return this.amount >= other.amount;
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount;
  }
}
