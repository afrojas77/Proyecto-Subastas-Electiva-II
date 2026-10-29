import { describe, expect, it, jest } from '@jest/globals';

import { InvalidPaymentOrderStateError } from '../../domain/errors/invalid-payment-order-state.error';
import { PaymentOrder } from '../../domain/entities/payment-order';
import { Money } from '../../domain/value-objects/money';
import { InMemoryPaymentEventRepository } from '../../infrastructure/persistence/memory/in-memory-payment-event.repository';
import { InMemoryPaymentOrderRepository } from '../../infrastructure/persistence/memory/in-memory-payment-order.repository';
import { InvalidPaymentNotificationError } from '../errors/invalid-payment-notification.error';
import { PaymentEventConflictError } from '../errors/payment-event-conflict.error';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import { UnverifiedPaymentNotificationError } from '../errors/unverified-payment-notification.error';
import type {
  PaymentNotificationVerificationRequest,
  PaymentNotificationVerificationResult,
  PaymentNotificationVerifier,
} from '../ports/payment-notification-verifier';
import type {
  RealtimeEvent,
  RealtimeEventPublisher,
} from '../ports/realtime-event-publisher';
import { ProcessPaymentNotification } from './process-payment-notification';

const CREATED_AT = new Date('2026-01-01T12:00:00.000Z');
const VALID_PAYLOAD = {
  id: 'event-1',
  paymentOrderId: 'payment-1',
  result: 'APPROVED',
  occurredAt: '2026-01-01T13:00:00.000Z',
} as const;

class StubVerifier implements PaymentNotificationVerifier {
  calls = 0;

  constructor(
    private readonly result: PaymentNotificationVerificationResult,
  ) {}

  verify(
    _request: PaymentNotificationVerificationRequest,
  ): Promise<PaymentNotificationVerificationResult> {
    void _request;
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

class RecordingRealtimeEventPublisher implements RealtimeEventPublisher {
  readonly events: RealtimeEvent[] = [];

  publish(event: RealtimeEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

async function setup(
  verification: PaymentNotificationVerificationResult = {
    verified: true,
    verificationData: 'verified-by-test-adapter',
  },
) {
  const verifier = new StubVerifier(verification);
  const paymentOrderRepository = new InMemoryPaymentOrderRepository();
  const paymentEventRepository = new InMemoryPaymentEventRepository();
  const realtimeEventPublisher = new RecordingRealtimeEventPublisher();
  const order = PaymentOrder.create(
    'payment-1',
    'auction-1',
    'bidder-1',
    new Money(100_000),
    CREATED_AT,
  );
  await paymentOrderRepository.save(order);
  return {
    verifier,
    order,
    paymentOrderRepository,
    paymentEventRepository,
    realtimeEventPublisher,
    useCase: new ProcessPaymentNotification(
      verifier,
      paymentOrderRepository,
      paymentEventRepository,
      realtimeEventPublisher,
    ),
  };
}

describe('ProcessPaymentNotification', () => {
  it('rechaza primero un origen inválido sin leer ni escribir repositorios', async () => {
    const context = await setup({ verified: false });
    const findEvent = jest.spyOn(context.paymentEventRepository, 'findById');
    const saveEvent = jest.spyOn(context.paymentEventRepository, 'save');
    const findOrder = jest.spyOn(context.paymentOrderRepository, 'findById');
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');

    await expect(
      context.useCase.execute({
        payload: { verified: true },
        verificationCredential: 'invalid',
      }),
    ).rejects.toBeInstanceOf(UnverifiedPaymentNotificationError);

    expect(context.verifier.calls).toBe(1);
    expect(findEvent).not.toHaveBeenCalled();
    expect(findOrder).not.toHaveBeenCalled();
    expect(saveEvent).not.toHaveBeenCalled();
    expect(saveOrder).not.toHaveBeenCalled();
    expect(context.order.status).toBe('PENDING');
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it('confirma una orden con una notificación legítima aprobada', async () => {
    const context = await setup();

    const response = await context.useCase.execute({
      payload: VALID_PAYLOAD,
      verificationCredential: 'accepted',
    });

    expect(response).toEqual({
      eventId: 'event-1',
      paymentOrderId: 'payment-1',
      result: 'APPROVED',
      orderStatus: 'PAID',
    });
    expect(context.order.status).toBe('PAID');
    expect(context.realtimeEventPublisher.events).toEqual([
      {
        type: 'payment:confirmed',
        auctionId: 'auction-1',
        paymentOrderId: 'payment-1',
        paymentEventId: 'event-1',
        occurredAt: '2026-01-01T13:00:00.000Z',
        orderStatus: 'PAID',
      },
    ]);
    expect(context.realtimeEventPublisher.events[0]).not.toHaveProperty(
      'originVerificationData',
    );
    expect(await context.paymentEventRepository.findById('event-1')).toMatchObject({
      response,
    });
  });

  it('registra una notificación legítima rechazada sin pagar la orden', async () => {
    const context = await setup();

    const response = await context.useCase.execute({
      payload: { ...VALID_PAYLOAD, result: 'REJECTED' },
      verificationCredential: 'accepted',
    });

    expect(response).toEqual({
      eventId: 'event-1',
      paymentOrderId: 'payment-1',
      result: 'REJECTED',
      orderStatus: 'PENDING',
    });
    expect(context.order.status).toBe('PENDING');
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it('devuelve la misma respuesta al repetir el mismo evento sin reaplicar cambios', async () => {
    const context = await setup();
    const saveOrder = jest.spyOn(context.paymentOrderRepository, 'save');
    const saveEvent = jest.spyOn(context.paymentEventRepository, 'save');

    const first = await context.useCase.execute({
      payload: VALID_PAYLOAD,
      verificationCredential: 'accepted',
    });
    const second = await context.useCase.execute({
      payload: { ...VALID_PAYLOAD },
      verificationCredential: 'accepted',
    });

    expect(second).toBe(first);
    expect(saveOrder).toHaveBeenCalledTimes(1);
    expect(saveEvent).toHaveBeenCalledTimes(1);
    expect(context.order.status).toBe('PAID');
    expect(context.realtimeEventPublisher.events).toHaveLength(1);
  });

  it('rechaza el mismo ID con contenido diferente y conserva el resultado original', async () => {
    const context = await setup();
    const original = await context.useCase.execute({
      payload: { ...VALID_PAYLOAD, result: 'REJECTED' },
      verificationCredential: 'accepted',
    });

    await expect(
      context.useCase.execute({
        payload: VALID_PAYLOAD,
        verificationCredential: 'accepted',
      }),
    ).rejects.toBeInstanceOf(PaymentEventConflictError);

    expect(context.order.status).toBe('PENDING');
    expect(
      (await context.paymentEventRepository.findById('event-1'))?.response,
    ).toBe(original);
    expect(context.realtimeEventPublisher.events).toHaveLength(0);
  });

  it('rechaza un evento para una orden inexistente sin registrarlo', async () => {
    const context = await setup();

    await expect(
      context.useCase.execute({
        payload: { ...VALID_PAYLOAD, paymentOrderId: 'missing' },
        verificationCredential: 'accepted',
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    expect(await context.paymentEventRepository.findById('event-1')).toBeUndefined();
  });

  it('rechaza una confirmación para una orden en estado terminal', async () => {
    const context = await setup();
    context.order.expire(context.order.dueAt);

    await expect(
      context.useCase.execute({
        payload: VALID_PAYLOAD,
        verificationCredential: 'accepted',
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentOrderStateError);

    expect(context.order.status).toBe('EXPIRED');
    expect(await context.paymentEventRepository.findById('event-1')).toBeUndefined();
  });

  it('valida la estructura sólo después de verificar el origen', async () => {
    const context = await setup();

    await expect(
      context.useCase.execute({
        payload: { id: 'event-1' },
        verificationCredential: 'accepted',
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentNotificationError);

    expect(context.verifier.calls).toBe(1);
    expect(await context.paymentEventRepository.findById('event-1')).toBeUndefined();
    expect(context.order.status).toBe('PENDING');
  });
});
