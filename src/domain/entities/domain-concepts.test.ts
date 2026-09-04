import { describe, expect, it } from '@jest/globals';

import { Article } from '../value-objects/article';
import { Category } from '../value-objects/category';
import { Email } from '../value-objects/email';
import { Money } from '../value-objects/money';
import { Notification, NotificationType } from './notification';
import { PaymentEvent } from './payment-event';
import { PaymentOrder } from './payment-order';
import { User } from './user';

describe('conceptos complementarios del dominio', () => {
  it('representa un usuario que puede actuar según el contexto de la subasta', () => {
    const user = new User('user-1', new Email('user@example.com'));
    expect(user.email.value).toBe('user@example.com');
  });

  it('representa artículo y categoría como valores inmutables', () => {
    const article = new Article('Libro', 'Primera edición', 'LIKE_NEW');
    const category = new Category('Libros');
    expect(Object.isFrozen(article)).toBe(true);
    expect(Object.isFrozen(category)).toBe(true);
  });

  it('representa una orden de pago pendiente con vencimiento a 48 horas', () => {
    const createdAt = new Date('2026-01-02T12:00:00.000Z');
    const order = PaymentOrder.create(
      'payment-1',
      'auction-1',
      'winner-1',
      new Money(150_000),
      createdAt,
    );
    expect(order.status).toBe('PENDING');
    expect(order.dueAt.getTime() - order.createdAt.getTime()).toBe(
      48 * 60 * 60 * 1000,
    );
  });

  it('no permite cambiar el estado de una orden desde fuera del dominio', () => {
    const order = PaymentOrder.create(
      'payment-1',
      'auction-1',
      'winner-1',
      new Money(150_000),
      new Date(),
    );

    expect(Reflect.set(order, 'status', 'PAID')).toBe(false);
    expect(order.status).toBe('PENDING');
  });

  it('representa un evento de pago con datos para verificar su origen', () => {
    const event = new PaymentEvent(
      'event-1',
      'payment-1',
      'APPROVED',
      new Date(),
      'external-signature-data',
    );
    expect(event.paymentOrderId).toBe('payment-1');
    expect(event.originVerificationData).toBe('external-signature-data');
  });

  it('representa una notificación sin depender de un canal de entrega', () => {
    const notification = new Notification(
      'notification-1',
      'user-1',
      'auction-1',
      NotificationType.AUCTION_WON,
      new Date(),
    );
    expect(notification.type).toBe(NotificationType.AUCTION_WON);
  });
});
