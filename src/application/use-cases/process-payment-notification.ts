import { PaymentEvent } from '../../domain/entities/payment-event';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import type {
  PaymentEventRepository,
  PaymentProcessingResponse,
} from '../../domain/ports/payment-event.repository';
import { InvalidPaymentNotificationError } from '../errors/invalid-payment-notification.error';
import { PaymentEventConflictError } from '../errors/payment-event-conflict.error';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';
import { UnverifiedPaymentNotificationError } from '../errors/unverified-payment-notification.error';
import type { PaymentNotificationVerifier } from '../ports/payment-notification-verifier';
import type { PersistenceTransaction } from '../ports/persistence-transaction';
import type { RealtimeEventPublisher } from '../ports/realtime-event-publisher';

export interface ProcessPaymentNotificationCommand {
  payload: unknown;
  verificationCredential?: string;
}

interface PaymentNotificationData {
  id: string;
  paymentOrderId: string;
  result: PaymentEvent['result'];
  occurredAt: Date;
}

interface PaymentNotificationProcessingResult {
  response: PaymentProcessingResponse;
  confirmedEvent?: PaymentEvent;
  auctionId?: string;
}

export class ProcessPaymentNotification {
  constructor(
    private readonly verifier: PaymentNotificationVerifier,
    private readonly paymentOrderRepository: PaymentOrderRepository,
    private readonly paymentEventRepository: PaymentEventRepository,
    private readonly realtimeEventPublisher: RealtimeEventPublisher,
    private readonly persistenceTransaction?: PersistenceTransaction,
  ) {}

  async execute(
    command: ProcessPaymentNotificationCommand,
  ): Promise<PaymentProcessingResponse> {
    const verification = await this.verifier.verify({
      payload: command.payload,
      credential: command.verificationCredential,
    });
    if (!verification.verified) {
      throw new UnverifiedPaymentNotificationError();
    }

    const data = parseNotification(command.payload);
    const contentKey = createContentKey(data);
    const process = (
      paymentOrderRepository: PaymentOrderRepository,
      paymentEventRepository: PaymentEventRepository,
    ) =>
      this.processVerifiedNotification(
        data,
        contentKey,
        verification.verificationData,
        paymentOrderRepository,
        paymentEventRepository,
      );
    const processing = this.persistenceTransaction
      ? await this.persistenceTransaction.execute(
          [`payment-event:${data.id}`, `payment-order:${data.paymentOrderId}`],
          (repositories) =>
            process(
              repositories.paymentOrderRepository,
              repositories.paymentEventRepository,
            ),
        )
      : await process(
          this.paymentOrderRepository,
          this.paymentEventRepository,
        );
    if (processing.confirmedEvent && processing.auctionId) {
      await this.realtimeEventPublisher.publish({
        type: 'payment:confirmed',
        auctionId: processing.auctionId,
        paymentOrderId: processing.confirmedEvent.paymentOrderId,
        paymentEventId: processing.confirmedEvent.id,
        occurredAt: processing.confirmedEvent.occurredAt.toISOString(),
        orderStatus: 'PAID',
      });
    }
    return processing.response;
  }

  private async processVerifiedNotification(
    data: PaymentNotificationData,
    contentKey: string,
    verificationData: string,
    paymentOrderRepository: PaymentOrderRepository,
    paymentEventRepository: PaymentEventRepository,
  ): Promise<PaymentNotificationProcessingResult> {
    const previousProcessing = await paymentEventRepository.findById(data.id);
    if (previousProcessing) {
      if (previousProcessing.contentKey !== contentKey) {
        throw new PaymentEventConflictError(data.id);
      }
      return { response: previousProcessing.response };
    }

    const paymentOrder = await paymentOrderRepository.findById(
      data.paymentOrderId,
    );
    if (!paymentOrder) {
      throw new ResourceNotFoundError('Orden de pago', data.paymentOrderId);
    }

    const paymentEvent = new PaymentEvent(
      data.id,
      data.paymentOrderId,
      data.result,
      data.occurredAt,
      verificationData,
    );
    if (paymentEvent.result === 'APPROVED') {
      paymentOrder.confirmWithVerifiedEvent(paymentEvent);
      await paymentOrderRepository.save(paymentOrder);
    }

    const response = Object.freeze({
      eventId: paymentEvent.id,
      paymentOrderId: paymentEvent.paymentOrderId,
      result: paymentEvent.result,
      orderStatus: paymentOrder.status,
    });
    await paymentEventRepository.save({
      event: paymentEvent,
      contentKey,
      response,
    });
    return {
      response,
      confirmedEvent:
        paymentEvent.result === 'APPROVED' ? paymentEvent : undefined,
      auctionId:
        paymentEvent.result === 'APPROVED' ? paymentOrder.auctionId : undefined,
    };
  }
}

function parseNotification(payload: unknown): PaymentNotificationData {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InvalidPaymentNotificationError(
      'La notificación de pago debe ser un objeto.',
    );
  }

  const body = payload as Record<string, unknown>;
  const id = requireNotificationString(body, 'id');
  const paymentOrderId = requireNotificationString(body, 'paymentOrderId');
  const result = body.result;
  if (result !== 'APPROVED' && result !== 'REJECTED') {
    throw new InvalidPaymentNotificationError(
      'result debe ser APPROVED o REJECTED.',
    );
  }
  const occurredAtValue = requireNotificationString(body, 'occurredAt');
  const occurredAt = new Date(occurredAtValue);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new InvalidPaymentNotificationError(
      'occurredAt debe ser una fecha ISO válida.',
    );
  }

  return { id, paymentOrderId, result, occurredAt };
}

function requireNotificationString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidPaymentNotificationError(
      `${field} es obligatorio y debe ser texto.`,
    );
  }
  return value;
}

function createContentKey(data: PaymentNotificationData): string {
  return JSON.stringify([
    data.id,
    data.paymentOrderId,
    data.result,
    data.occurredAt.toISOString(),
  ]);
}
