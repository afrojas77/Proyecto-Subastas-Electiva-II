import { describe, expect, it } from '@jest/globals';

import { BcryptPasswordHasher } from './bcrypt-password-hasher';
import { loadAuthenticationConfig } from './authentication-config';
import { JwtAccessTokenService } from './jwt-access-token-service';

const SECRET = 'test-secret-with-at-least-thirty-two-characters';

describe('adaptadores de autenticación', () => {
  it('bcrypt genera un hash salado y verifica la contraseña', async () => {
    const hasher = new BcryptPasswordHasher(10);
    const hash = await hasher.hash('correct-password');

    expect(hash).not.toBe('correct-password');
    await expect(hasher.verify('correct-password', hash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('JWT conserva la identidad y rechaza alteraciones y expiración', () => {
    const service = new JwtAccessTokenService(SECRET, 3600);
    const issued = service.issue({ userId: 'user-1' });

    expect(service.verify(issued.token)).toEqual({ userId: 'user-1' });
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(() => service.verify(`${issued.token}altered`)).toThrow();

    const expired = new JwtAccessTokenService(SECRET, -1).issue({
      userId: 'user-1',
    });
    expect(() => service.verify(expired.token)).toThrow();
  });

  it('valida secreto y expiración configurados', () => {
    expect(
      loadAuthenticationConfig({
        AUTH_TOKEN_SECRET: SECRET,
        AUTH_TOKEN_EXPIRES_IN_SECONDS: '3600',
      }),
    ).toEqual({ tokenSecret: SECRET, tokenExpiresInSeconds: 3600 });
    expect(() => loadAuthenticationConfig({})).toThrow(
      'AUTH_TOKEN_SECRET es obligatorio.',
    );
    expect(() =>
      loadAuthenticationConfig({
        AUTH_TOKEN_SECRET:
          'replace_with_a_random_secret_of_at_least_32_characters',
        AUTH_TOKEN_EXPIRES_IN_SECONDS: '3600',
      }),
    ).toThrow('AUTH_TOKEN_SECRET debe reemplazar el marcador');
    expect(() =>
      loadAuthenticationConfig({
        AUTH_TOKEN_SECRET: SECRET,
        AUTH_TOKEN_EXPIRES_IN_SECONDS: 'invalid',
      }),
    ).toThrow('AUTH_TOKEN_EXPIRES_IN_SECONDS debe ser un entero positivo.');
  });
});
