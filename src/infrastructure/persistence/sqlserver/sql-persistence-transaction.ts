import * as mssql from 'mssql';

import type {
  PersistenceTransaction,
  TransactionRepositories,
} from '../../../application/ports/persistence-transaction';
import type {
  SqlDatabase,
  SqlExecutor,
  SqlParameter,
  SqlQueryResult,
} from './sql-executor';
import { SqlAuctionRepository } from './sql-auction.repository';
import { SqlPaymentEventRepository } from './sql-payment-event.repository';
import { SqlPaymentOrderRepository } from './sql-payment-order.repository';

interface ApplicationLockResult {
  result: number;
}

export class SqlPersistenceTransaction implements PersistenceTransaction {
  constructor(private readonly database: SqlDatabase) {}

  execute<Result>(
    lockKeys: readonly string[],
    work: (repositories: TransactionRepositories) => Promise<Result>,
  ): Promise<Result> {
    return this.database.transaction(async (executor) => {
      for (const lockKey of [...new Set(lockKeys)].sort()) {
        await acquireTransactionLock(executor, lockKey);
      }
      const scopedDatabase = new TransactionScopedDatabase(executor);
      return work({
        auctionRepository: new SqlAuctionRepository(scopedDatabase),
        paymentEventRepository: new SqlPaymentEventRepository(scopedDatabase),
        paymentOrderRepository: new SqlPaymentOrderRepository(scopedDatabase),
      });
    });
  }
}

class TransactionScopedDatabase implements SqlDatabase {
  constructor(private readonly executor: SqlExecutor) {}

  query<Row>(
    statement: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<SqlQueryResult<Row>> {
    return this.executor.query<Row>(statement, parameters);
  }

  transaction<Result>(
    work: (executor: SqlExecutor) => Promise<Result>,
  ): Promise<Result> {
    return work(this.executor);
  }
}

async function acquireTransactionLock(
  executor: SqlExecutor,
  lockKey: string,
): Promise<void> {
  const result = await executor.query<ApplicationLockResult>(
    `DECLARE @result INT;
     EXEC @result = sys.sp_getapplock
       @Resource = @lockKey,
       @LockMode = N'Exclusive',
       @LockOwner = N'Transaction',
       @LockTimeout = 15000;
     SELECT @result AS result;`,
    [{ name: 'lockKey', type: mssql.NVarChar(255), value: lockKey }],
  );
  if (Number(result.recordset[0]?.result ?? -999) < 0) {
    throw new Error(`No se pudo adquirir el bloqueo transaccional ${lockKey}.`);
  }
}
