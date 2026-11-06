import { requireNonEmpty } from '../internal/validation';
import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';
import type { Email } from '../value-objects/email';

export class User {
  public readonly id: string;
  public readonly name?: string;

  constructor(
    id: string,
    public readonly email: Email,
    public readonly passwordHash?: string,
    name?: string,
  ) {
    this.id = requireNonEmpty(id, 'El identificador del usuario');
    if (name !== undefined) {
      this.name = requireNonEmpty(name, 'El nombre del usuario');
      if (this.name.length > 200) {
        throw new InvalidDomainValueError(
          'El nombre del usuario no puede superar 200 caracteres.',
        );
      }
    }
    if (passwordHash !== undefined) {
      requireNonEmpty(passwordHash, 'El hash de contraseña');
    }
    Object.freeze(this);
  }
}
