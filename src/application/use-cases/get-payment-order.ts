import type { PaymentOrder } from '../../domain/entities/payment-order';
import type { PaymentOrderRepository } from '../../domain/ports/payment-order.repository';
import { AuthorizationError } from '../errors/authorization.error';
import { ResourceNotFoundError } from '../errors/resource-not-found.error';

export interface GetPaymentOrderInput {
  paymentOrderId: string;
  requesterId: string;
}

export class GetPaymentOrder {
  constructor(
    private readonly paymentOrderRepository: PaymentOrderRepository,
  ) {}

  async execute(input: GetPaymentOrderInput): Promise<PaymentOrder> {
    const order = await this.paymentOrderRepository.findById(
      input.paymentOrderId,
    );
    if (!order) {
      throw new ResourceNotFoundError(
        'Orden de pago',
        input.paymentOrderId,
      );
    }
    if (order.debtorId !== input.requesterId) {
      throw new AuthorizationError(
        'Sólo el ganador puede consultar esta orden de pago.',
      );
    }
    return order;
  }
}
