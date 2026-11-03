export class DuplicateEmailError extends Error {
  constructor() {
    super('Ya existe un usuario registrado con ese correo electrónico.');
    this.name = 'DuplicateEmailError';
  }
}
