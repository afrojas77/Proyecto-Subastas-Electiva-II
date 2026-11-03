import { describe, expect, it, jest } from '@jest/globals';
import type { ConnectionPool } from 'mssql';

import {
  SqlServerConnectionError,
  SqlServerDatabase,
} from './sqlserver-database';

const CONFIG = {
  server: 'localhost',
  database: 'SubastasDB',
  user: 'application-user',
  password: 'not-a-real-password',
};

describe('SqlServerDatabase', () => {
  it('convierte errores de conexión en un error claro sin credenciales', async () => {
    const pool = {
      connected: false,
      connect: jest.fn(() => Promise.reject(new Error('login failed'))),
    } as unknown as ConnectionPool;
    const database = new SqlServerDatabase(CONFIG, () => pool);

    await expect(database.connect()).rejects.toBeInstanceOf(
      SqlServerConnectionError,
    );
    await expect(database.connect()).rejects.not.toThrow(
      'not-a-real-password',
    );
  });

  it('cierra el pool compartido conectado', async () => {
    const close = jest.fn(() => Promise.resolve());
    const pool = {
      connected: true,
      connect: jest.fn(() => Promise.resolve(pool)),
      close,
    } as unknown as ConnectionPool;
    const database = new SqlServerDatabase(CONFIG, () => pool);

    await database.connect();
    await database.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
