export interface AuthenticationConfig {
  readonly tokenSecret: string;
  readonly tokenExpiresInSeconds: number;
}

export function loadAuthenticationConfig(
  environment: NodeJS.ProcessEnv,
): AuthenticationConfig {
  const tokenSecret = required(environment, 'AUTH_TOKEN_SECRET');
  if (tokenSecret.startsWith('replace_with_')) {
    throw new Error(
      'AUTH_TOKEN_SECRET debe reemplazar el marcador de .env.example.',
    );
  }
  if (tokenSecret.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET debe tener al menos 32 caracteres.');
  }
  const expirationValue = required(
    environment,
    'AUTH_TOKEN_EXPIRES_IN_SECONDS',
  );
  const tokenExpiresInSeconds = Number(expirationValue);
  if (!Number.isInteger(tokenExpiresInSeconds) || tokenExpiresInSeconds <= 0) {
    throw new Error(
      'AUTH_TOKEN_EXPIRES_IN_SECONDS debe ser un entero positivo.',
    );
  }
  return Object.freeze({ tokenSecret, tokenExpiresInSeconds });
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} es obligatorio.`);
  }
  return value;
}
