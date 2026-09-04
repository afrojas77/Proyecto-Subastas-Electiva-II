import { requireNonEmpty } from '../internal/validation';
import type { Email } from '../value-objects/email';

export class User {
  public readonly id: string;
  constructor(
    id: string,
    public readonly email: Email,
  ) {
    this.id = requireNonEmpty(id, 'El identificador del usuario');
    Object.freeze(this);
  }
}
