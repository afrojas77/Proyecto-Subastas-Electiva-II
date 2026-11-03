import { requireNonEmpty } from '../internal/validation';
import type { Email } from '../value-objects/email';

export class User {
  public readonly id: string;
  constructor(
    id: string,
    public readonly email: Email,
    public readonly passwordHash?: string,
  ) {
    this.id = requireNonEmpty(id, 'El identificador del usuario');
    if (passwordHash !== undefined) {
      requireNonEmpty(passwordHash, 'El hash de contraseña');
    }
    Object.freeze(this);
  }
}
