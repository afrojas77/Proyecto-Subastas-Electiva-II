export class PaymentEventConflictError extends Error {
  constructor(id: string) {
    super(`El evento ${id} ya fue procesado con un contenido diferente.`);
    this.name = 'PaymentEventConflictError';
  }
}
