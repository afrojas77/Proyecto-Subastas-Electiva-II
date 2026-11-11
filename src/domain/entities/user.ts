import { requireNonEmpty } from '../internal/validation';
import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';
import type { Email } from '../value-objects/email';

export class User {
  public readonly id: string;
  public readonly name?: string;
  public readonly documentType?: string;
  public readonly documentNumber?: string;
  public readonly phone?: string;

  constructor(
    id: string,
    public readonly email: Email,
    public readonly passwordHash?: string,
    name?: string,
    documentType?: string,
    documentNumber?: string,
    phone?: string,
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
    if (documentType !== undefined) {
      const normalizedType = requireNonEmpty(
        documentType,
        'El tipo de documento',
      );
      if (!['CC', 'CE', 'PASSPORT'].includes(normalizedType)) {
        throw new InvalidDomainValueError('El tipo de documento no es válido.');
      }
      this.documentType = normalizedType;
    }
    if (documentNumber !== undefined) {
      this.documentNumber = requireNonEmpty(
        documentNumber,
        'El número de documento',
      );
      if (!/^[A-Za-z0-9-]{5,30}$/.test(this.documentNumber)) {
        throw new InvalidDomainValueError(
          'El número de documento debe tener entre 5 y 30 caracteres alfanuméricos.',
        );
      }
    }
    if (phone !== undefined) {
      this.phone = requireNonEmpty(phone, 'El teléfono');
      if (!/^\+?[0-9]{7,15}$/.test(this.phone)) {
        throw new InvalidDomainValueError(
          'El teléfono debe contener entre 7 y 15 dígitos.',
        );
      }
    }
    Object.freeze(this);
  }
}
