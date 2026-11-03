import * as mssql from 'mssql';

import type { PaymentOrder } from '../../../domain/entities/payment-order';
import type { PaymentOrderRepository } from '../../../domain/ports/payment-order.repository';
import type { SqlDatabase } from './sql-executor';
import {
  restorePaymentOrder,
  type PaymentOrderRow,
} from './sqlserver-mappers';

export class SqlPaymentOrderRepository implements PaymentOrderRepository {
  constructor(private readonly database: SqlDatabase) {}

  async findById(id: string): Promise<PaymentOrder | undefined> {
    const result = await this.database.query<PaymentOrderRow>(
      `${PAYMENT_ORDER_COLUMNS}
       WHERE id = @id;`,
      [{ name: 'id', type: mssql.NVarChar(100), value: id }],
    );
    const row = result.recordset[0];
    return row ? restorePaymentOrder(row) : undefined;
  }

  async save(order: PaymentOrder): Promise<void> {
    await this.database.query(
      `MERGE dbo.payment_orders AS target
       USING (
         SELECT @id AS id, @auctionId AS auction_id, @debtorId AS debtor_id,
                @amount AS amount, @createdAt AS created_at, @dueAt AS due_at,
                @status AS status
       ) AS source
       ON target.id = source.id
       WHEN MATCHED THEN UPDATE SET
         auction_id = source.auction_id,
         debtor_id = source.debtor_id,
         amount = source.amount,
         created_at = source.created_at,
         due_at = source.due_at,
         status = source.status
       WHEN NOT MATCHED THEN INSERT (
         id, auction_id, debtor_id, amount, created_at, due_at, status
       ) VALUES (
         source.id, source.auction_id, source.debtor_id, source.amount,
         source.created_at, source.due_at, source.status
       );`,
      [
        { name: 'id', type: mssql.NVarChar(100), value: order.id },
        {
          name: 'auctionId',
          type: mssql.NVarChar(100),
          value: order.auctionId,
        },
        {
          name: 'debtorId',
          type: mssql.NVarChar(100),
          value: order.debtorId,
        },
        { name: 'amount', type: mssql.BigInt, value: order.amount.amount },
        { name: 'createdAt', type: mssql.DateTime2(3), value: order.createdAt },
        { name: 'dueAt', type: mssql.DateTime2(3), value: order.dueAt },
        { name: 'status', type: mssql.NVarChar(20), value: order.status },
      ],
    );
  }
}

export const PAYMENT_ORDER_COLUMNS = `SELECT
  id, auction_id, debtor_id, amount, created_at, due_at, status
FROM dbo.payment_orders`;
