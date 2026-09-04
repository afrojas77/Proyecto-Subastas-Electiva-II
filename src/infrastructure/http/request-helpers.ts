import { HttpValidationError } from './errors/http-validation.error';

export type HttpBody = Record<string, unknown>;

export function requireBody(value: unknown): HttpBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpValidationError('El cuerpo de la solicitud es obligatorio.');
  }
  return value as HttpBody;
}

export function requireString(body: HttpBody, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpValidationError(`${field} es obligatorio y debe ser texto.`);
  }
  return value;
}

export function requireNumber(body: HttpBody, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpValidationError(
      `${field} es obligatorio y debe ser numérico.`,
    );
  }
  return value;
}

export function requireDate(body: HttpBody, field: string): Date {
  const value = requireString(body, field);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpValidationError(`${field} debe ser una fecha ISO válida.`);
  }
  return date;
}

export function requireRouteId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpValidationError('id de recurso inválido.');
  }
  return value;
}
