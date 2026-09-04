import { InvalidEmailError } from '../errors/invalid-email.error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  public readonly value: string;

  constructor(value: string) {
    const normalizedValue = value.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedValue)) {
      throw new InvalidEmailError(value);
    }
    this.value = normalizedValue;
    Object.freeze(this);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
