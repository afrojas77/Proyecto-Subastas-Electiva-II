export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Se requiere un token de acceso válido.');
    this.name = 'AuthenticationRequiredError';
  }
}
