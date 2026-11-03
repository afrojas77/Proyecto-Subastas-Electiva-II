export class InvalidPasswordError extends Error {
  constructor() {
    super(
      'La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes.',
    );
    this.name = 'InvalidPasswordError';
  }
}
