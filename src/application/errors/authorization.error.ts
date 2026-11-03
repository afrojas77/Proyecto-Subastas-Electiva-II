export class AuthorizationError extends Error {
  constructor(message = 'No tiene permiso para realizar esta operación.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
