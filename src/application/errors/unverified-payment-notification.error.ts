export class UnverifiedPaymentNotificationError extends Error {
  constructor() {
    super('No se pudo verificar el origen de la notificación de pago.');
    this.name = 'UnverifiedPaymentNotificationError';
  }
}
