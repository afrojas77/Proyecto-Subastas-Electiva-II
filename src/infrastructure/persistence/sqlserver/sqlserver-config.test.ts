import { describe, expect, it } from '@jest/globals';

import { selectPersistence } from '../persistence-factory';
import {
  InvalidSqlServerConfigurationError,
  loadSqlServerConfig,
} from './sqlserver-config';

const VALID_ENVIRONMENT: NodeJS.ProcessEnv = {
  DB_SERVER: 'localhost',
  DB_DATABASE: 'SubastasDB',
  DB_USER: 'application-user',
  DB_PASSWORD: 'not-a-real-password',
};

describe('configuración SQL Server', () => {
  it('construye la configuración con valores predeterminados seguros', () => {
    const config = loadSqlServerConfig(VALID_ENVIRONMENT);

    expect(config).toMatchObject({
      server: 'localhost',
      port: 1433,
      database: 'SubastasDB',
      user: 'application-user',
      password: 'not-a-real-password',
      connectionTimeout: 15_000,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        useUTC: true,
      },
    });
  });

  it('valida variables obligatorias, booleanos y enteros', () => {
    expect(() =>
      loadSqlServerConfig({ ...VALID_ENVIRONMENT, DB_PASSWORD: '' }),
    ).toThrow(InvalidSqlServerConfigurationError);
    expect(() =>
      loadSqlServerConfig({ ...VALID_ENVIRONMENT, DB_ENCRYPT: 'sometimes' }),
    ).toThrow('DB_ENCRYPT debe ser true o false');
    expect(() =>
      loadSqlServerConfig({ ...VALID_ENVIRONMENT, DB_PORT: 'zero' }),
    ).toThrow('DB_PORT debe ser un entero positivo');
  });

  it('prohíbe memoria y selección implícita en producción', () => {
    expect(() => selectPersistence({ NODE_ENV: 'production' })).toThrow(
      'PERSISTENCE=sqlserver',
    );
    expect(() =>
      selectPersistence({ NODE_ENV: 'production', PERSISTENCE: 'memory' }),
    ).toThrow('no está permitida en producción');
    expect(
      selectPersistence({ NODE_ENV: 'production', PERSISTENCE: 'sqlserver' }),
    ).toBe('sqlserver');
  });
});
