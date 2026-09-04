import { DomainError } from './domain.error';

export class InvalidEmailError extends DomainError {
  constructor(email: string) {
    super(
      `El correo electrónico no tiene un formato válido: ${email}`,
      'INVALID_EMAIL',
    );
  }
}
