import { describe, expect, it } from '@jest/globals';

import { AuthenticationRequiredError } from '../errors/authentication-required.error';
import { DuplicateEmailError } from '../errors/duplicate-email.error';
import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import { InvalidPasswordError } from '../errors/invalid-password.error';
import type {
  AccessTokenPayload,
  AccessTokenService,
} from '../ports/access-token-service';
import type { PasswordHasher } from '../ports/password-hasher';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { Auction } from '../../domain/entities/auction';
import { Bid } from '../../domain/entities/bid';
import { Article } from '../../domain/value-objects/article';
import { AuctionStatus } from '../../domain/value-objects/auction-status';
import { Category } from '../../domain/value-objects/category';
import { Money } from '../../domain/value-objects/money';
import { InMemoryUserRepository } from '../../infrastructure/persistence/memory/in-memory-user.repository';
import { InMemoryAuctionRepository } from '../../infrastructure/persistence/memory/in-memory-auction.repository';
import { GetAuthenticatedProfile } from './get-authenticated-profile';
import { LoginUser } from './login-user';
import { RegisterUser } from './register-user';

class RecordingPasswordHasher implements PasswordHasher {
  readonly hashes = new Map<string, string>();

  hash(password: string): Promise<string> {
    const result = `hash::${password}`;
    this.hashes.set(password, result);
    return Promise.resolve(result);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return Promise.resolve(passwordHash === `hash::${password}`);
  }
}

class RecordingTokenService implements AccessTokenService {
  issued?: AccessTokenPayload;

  issue(payload: AccessTokenPayload) {
    this.issued = payload;
    return {
      token: `token-for-${payload.userId}`,
      expiresAt: new Date('2026-06-01T13:00:00.000Z'),
    };
  }

  verify(token: string): AccessTokenPayload {
    return { userId: token.replace('token-for-', '') };
  }
}

function setup() {
  const repository = new InMemoryUserRepository();
  const auctionRepository = new InMemoryAuctionRepository();
  const hasher = new RecordingPasswordHasher();
  const tokens = new RecordingTokenService();
  const register = new RegisterUser(repository, hasher, {
    generate: () => 'user-1',
  });
  return {
    repository,
    auctionRepository,
    hasher,
    tokens,
    register,
    login: new LoginUser(repository, hasher, tokens),
    profile: new GetAuthenticatedProfile(repository, auctionRepository),
  };
}

describe('casos de uso de autenticación', () => {
  it('registra correo normalizado y almacena hash sin exponerlo', async () => {
    const context = setup();

    const result = await context.register.execute({
      name: '  Andrea Rojas  ',
      email: '  USER@EXAMPLE.COM ',
      password: 'correct-password',
    });
    const stored = await context.repository.findById('user-1');

    expect(result).toEqual({
      id: 'user-1',
      name: 'Andrea Rojas',
      email: 'user@example.com',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(stored?.passwordHash).toBe('hash::correct-password');
    expect(stored?.passwordHash).not.toBe('correct-password');
  });

  it('rechaza correo duplicado, correo inválido y contraseña inválida', async () => {
    const context = setup();
    await context.register.execute({
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(
      context.register.execute({
        name: 'Andrea Rojas',
        email: 'USER@example.com',
        password: 'another-password',
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    await expect(
      context.register.execute({
        name: 'Andrea Rojas',
        email: 'invalid',
        password: 'password',
      }),
    ).rejects.toBeInstanceOf(InvalidEmailError);
    await expect(
      context.register.execute({
        name: 'Andrea Rojas',
        email: 'other@example.com',
        password: 'short',
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it('inicia sesión con credenciales correctas y emite token con expiración', async () => {
    const context = setup();
    await context.register.execute({
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password: 'correct-password',
    });

    const result = await context.login.execute({
      email: 'USER@EXAMPLE.COM',
      password: 'correct-password',
    });

    expect(result.token).toBe('token-for-user-1');
    expect(result.expiresAt).toEqual(new Date('2026-06-01T13:00:00.000Z'));
    expect(context.tokens.issued).toEqual({ userId: 'user-1' });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['user@example.com', 'wrong-password'],
    ['missing@example.com', 'correct-password'],
    ['not-an-email', 'correct-password'],
  ])('no distingue credenciales inválidas para %s', async (email, password) => {
    const context = setup();
    await context.register.execute({
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(context.login.execute({ email, password })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('obtiene el perfil propio y rechaza una identidad inexistente', async () => {
    const context = setup();
    await context.register.execute({
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password: 'correct-password',
    });

    await expect(context.profile.execute('user-1')).resolves.toEqual({
      id: 'user-1',
      name: 'Andrea Rojas',
      email: 'user@example.com',
      publishedAuctions: [],
      participatedAuctions: [],
    });
    await expect(context.profile.execute('missing')).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it('incluye las subastas publicadas y aquellas en las que participó', async () => {
    const context = setup();
    await context.register.execute({
      name: 'Andrea Rojas',
      email: 'user@example.com',
      password: 'correct-password',
    });
    await context.auctionRepository.save(profileAuction('published', 'user-1'));
    await context.auctionRepository.save(
      profileAuction('participated', 'other-seller', 'user-1'),
    );

    const profile = await context.profile.execute('user-1');

    expect(profile.publishedAuctions.map(({ id }) => id)).toEqual([
      'published',
    ]);
    expect(profile.participatedAuctions.map(({ id }) => id)).toEqual([
      'participated',
    ]);
  });
});

function profileAuction(
  id: string,
  sellerId: string,
  bidderId?: string,
): Auction {
  const publishedAt = new Date('2026-01-01T12:00:00.000Z');
  return Auction.restore({
    id,
    sellerId,
    article: new Article('Libro', 'Primera edición', 'USED'),
    category: new Category('Libros'),
    basePrice: new Money(100_000),
    minimumIncrement: new Money(10_000),
    publishedAt,
    closesAt: new Date('2026-01-02T12:00:00.000Z'),
    status: AuctionStatus.OPEN,
    acceptedBids: bidderId
      ? [
          new Bid(
            `${id}-bid`,
            id,
            bidderId,
            new Money(100_000),
            new Date('2026-01-01T13:00:00.000Z'),
            1,
          ),
        ]
      : [],
    rejectedBidAttempts: [],
  });
}
