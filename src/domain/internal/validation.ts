import { InvalidDomainValueError } from '../errors/invalid-domain-value.error';

export function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new InvalidDomainValueError(`${field} no puede estar vacío.`);
  }
  return normalized;
}

export function copyValidDate(value: Date, field: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidDomainValueError(`${field} debe ser una fecha válida.`);
  }
  return new Date(value.getTime());
}
