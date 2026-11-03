import * as mssql from 'mssql';

import type {
  PaymentEventRepository,
  ProcessedPaymentEvent,
} from '../../../domain/ports/payment-event.repository';
import type { SqlDatabase } from './sql-executor';
import {
  restoreProcessedPaymentEvent,
  type PaymentEventRow,
} from './sqlserver-mappers';

export class SqlPaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly database: SqlDatabase) {}

  async findById(id: string): Promise<ProcessedPaymentEvent | undefined> {
    const result = await this.database.query<PaymentEventRow>(
      `SELECT id, payment_order_id, result, occurred_at,
              origin_verification_data, content_key, response_event_id,
              response_payment_order_id, response_result,
              response_order_status
       FROM dbo.payment_events
       WHERE id = @id;`,
      [{ name: 'id', type: mssql.NVarChar(100), value: id }],
    );
    const row = result.recordset[0];
    return row ? restoreProcessedPaymentEvent(row) : undefined;
  }

  async save(processedEvent: ProcessedPaymentEvent): Promise<void> {
    const { event, response } = processedEvent;
    await this.database.query(
      `INSERT INTO dbo.payment_events (
         id, payment_order_id, result, occurred_at,
         origin_verification_data, content_key, response_event_id,
         response_payment_order_id, response_result, response_order_status
       ) VALUES (
         @id, @paymentOrderId, @result, @occurredAt,
         @originVerificationData, @contentKey, @responseEventId,
         @responsePaymentOrderId, @responseResult, @responseOrderStatus
       );`,
      [
        { name: 'id', type: mssql.NVarChar(100), value: event.id },
        {
          name: 'paymentOrderId',
          type: mssql.NVarChar(100),
          value: event.paymentOrderId,
        },
        { name: 'result', type: mssql.NVarChar(20), value: event.result },
        {
          name: 'occurredAt',
          type: mssql.DateTime2(3),
          value: event.occurredAt,
        },
        {
          name: 'originVerificationData',
          type: mssql.NVarChar(2048),
          value: event.originVerificationData,
        },
        {
          name: 'contentKey',
          type: mssql.NVarChar(1000),
          value: processedEvent.contentKey,
        },
        {
          name: 'responseEventId',
          type: mssql.NVarChar(100),
          value: response.eventId,
        },
        {
          name: 'responsePaymentOrderId',
          type: mssql.NVarChar(100),
          value: response.paymentOrderId,
        },
        {
          name: 'responseResult',
          type: mssql.NVarChar(20),
          value: response.result,
        },
        {
          name: 'responseOrderStatus',
          type: mssql.NVarChar(20),
          value: response.orderStatus,
        },
      ],
    );
  }
}
