import type { config as MssqlConfig } from 'mssql';

export class InvalidSqlServerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSqlServerConfigurationError';
  }
}

export function loadSqlServerConfig(
  environment: NodeJS.ProcessEnv,
): MssqlConfig {
  return {
    server: requireEnvironmentValue(environment, 'DB_SERVER'),
    port: optionalPositiveInteger(environment, 'DB_PORT', 1433),
    database: requireEnvironmentValue(environment, 'DB_DATABASE'),
    user: requireEnvironmentValue(environment, 'DB_USER'),
    password: requireEnvironmentValue(environment, 'DB_PASSWORD'),
    connectionTimeout: optionalPositiveInteger(
      environment,
      'DB_CONNECTION_TIMEOUT',
      15_000,
    ),
    options: {
      encrypt: optionalBoolean(environment, 'DB_ENCRYPT', true),
      useUTC: true,
      trustServerCertificate: optionalBoolean(
        environment,
        'DB_TRUST_SERVER_CERTIFICATE',
        false,
      ),
    },
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 30_000,
    },
  };
}

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new InvalidSqlServerConfigurationError(
      `La variable ${name} es obligatoria para SQL Server.`,
    );
  }
  return value;
}

function optionalPositiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  const rawValue = environment[name]?.trim();
  if (!rawValue) {
    return defaultValue;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidSqlServerConfigurationError(
      `La variable ${name} debe ser un entero positivo.`,
    );
  }
  return value;
}

function optionalBoolean(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: boolean,
): boolean {
  const rawValue = environment[name]?.trim().toLowerCase();
  if (!rawValue) {
    return defaultValue;
  }
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  throw new InvalidSqlServerConfigurationError(
    `La variable ${name} debe ser true o false.`,
  );
}
