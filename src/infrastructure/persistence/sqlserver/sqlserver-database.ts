import * as mssql from 'mssql';

import type {
  SqlDatabase,
  SqlExecutor,
  SqlParameter,
  SqlQueryResult,
} from './sql-executor';

export class SqlServerConnectionError extends Error {
  constructor(options?: ErrorOptions) {
    super('No fue posible conectar con SQL Server.', options);
    this.name = 'SqlServerConnectionError';
  }
}

type PoolFactory = (config: mssql.config) => mssql.ConnectionPool;

export class SqlServerDatabase implements SqlDatabase {
  private pool?: mssql.ConnectionPool;

  constructor(
    private readonly config: mssql.config,
    private readonly poolFactory: PoolFactory = (config) =>
      new mssql.ConnectionPool(config),
  ) {}

  async connect(): Promise<void> {
    if (this.pool?.connected) {
      return;
    }
    const pool = this.poolFactory(this.config);
    try {
      this.pool = await pool.connect();
    } catch (error: unknown) {
      this.pool = undefined;
      throw new SqlServerConnectionError({
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async close(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    if (pool) {
      await pool.close();
    }
  }

  query<Row>(
    statement: string,
    parameters: readonly SqlParameter[] = [],
  ): Promise<SqlQueryResult<Row>> {
    return executeQuery(this.requirePool().request(), statement, parameters);
  }

  async transaction<Result>(
    work: (executor: SqlExecutor) => Promise<Result>,
  ): Promise<Result> {
    const transaction = this.requirePool().transaction();
    await transaction.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
    const executor: SqlExecutor = {
      query: <Row>(
        statement: string,
        parameters: readonly SqlParameter[] = [],
      ) => executeQuery<Row>(transaction.request(), statement, parameters),
    };
    try {
      const result = await work(executor);
      await transaction.commit();
      return result;
    } catch (error: unknown) {
      try {
        await transaction.rollback();
      } catch {
        // Se conserva el error original de la operación.
      }
      throw error;
    }
  }

  private requirePool(): mssql.ConnectionPool {
    if (!this.pool?.connected) {
      throw new SqlServerConnectionError();
    }
    return this.pool;
  }
}

async function executeQuery<Row>(
  request: mssql.Request,
  statement: string,
  parameters: readonly SqlParameter[],
): Promise<SqlQueryResult<Row>> {
  for (const parameter of parameters) {
    request.input(parameter.name, parameter.type, parameter.value);
  }
  const result = await request.query<Row>(statement);
  return { recordset: result.recordset };
}
