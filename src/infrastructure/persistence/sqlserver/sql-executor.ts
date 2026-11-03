import type { ISqlType } from 'mssql';

export interface SqlParameter {
  name: string;
  type: (() => ISqlType) | ISqlType;
  value: unknown;
}

export interface SqlQueryResult<Row> {
  readonly recordset: readonly Row[];
}

export interface SqlExecutor {
  query<Row>(
    statement: string,
    parameters?: readonly SqlParameter[],
  ): Promise<SqlQueryResult<Row>>;
}

export interface SqlDatabase extends SqlExecutor {
  transaction<Result>(
    work: (executor: SqlExecutor) => Promise<Result>,
  ): Promise<Result>;
}
