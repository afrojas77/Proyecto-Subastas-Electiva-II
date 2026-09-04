import { DomainError } from './domain.error';

export class InvalidDomainValueError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_DOMAIN_VALUE');
  }
}
