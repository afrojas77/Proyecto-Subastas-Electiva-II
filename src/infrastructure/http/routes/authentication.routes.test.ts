import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';

import { createApp } from '../../../app';
import type { RealtimeEventPublisher } from '../../../application/ports/realtime-event-publisher';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher';
import { JwtAccessTokenService } from '../../auth/jwt-access-token-service';
import { InMemoryUserRepository } from '../../persistence/memory/in-memory-user.repository';

const SECRET = 'http-test-secret-with-at-least-thirty-two-characters';
const silentPublisher: RealtimeEventPublisher = {
  publish: () => Promise.resolve(),
};

function setup(expiresInSeconds = 3600) {
  const userRepository = new InMemoryUserRepository();
  const tokenService = new JwtAccessTokenService(SECRET, expiresInSeconds);
  const app = createApp({
    realtimeEventPublisher: silentPublisher,
    accessTokenService: tokenService,
    idGenerator: { generate: () => 'user-1' },
    passwordHasher: new BcryptPasswordHasher(10),
    userRepository,
  });
  return { api: request(app), userRepository };
}

function body<T>(response: SupertestResponse): T {
  return response.body as T;
}

async function register(api: ReturnType<typeof request>) {
  return api.post('/api/users/register').send({
    email: 'USER@EXAMPLE.COM',
    password: 'correct-password',
  });
}

async function login(api: ReturnType<typeof request>) {
  return api.post('/api/auth/login').send({
    email: 'user@example.com',
    password: 'correct-password',
  });
}

describe('API de usuarios y autenticación', () => {
  it('registra un usuario sin devolver ni guardar la contraseña original', async () => {
    const context = setup();

    const response = await register(context.api);
    const stored = await context.userRepository.findById('user-1');

    expect(response.status).toBe(201);
    expect(body<Record<string, unknown>>(response)).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(stored?.passwordHash).toBeDefined();
    expect(stored?.passwordHash).not.toBe('correct-password');
  });

  it('rechaza correo duplicado, correo inválido y contraseña inválida', async () => {
    const context = setup();
    await register(context.api);

    const duplicate = await register(context.api);
    const invalidEmail = await context.api.post('/api/users/register').send({
      email: 'invalid',
      password: 'correct-password',
    });
    const invalidPassword = await context.api.post('/api/users/register').send({
      email: 'other@example.com',
      password: 'short',
    });

    expect(duplicate.status).toBe(409);
    expect(body<{ error: { code: string } }>(duplicate).error.code).toBe(
      'DUPLICATE_EMAIL',
    );
    expect(invalidEmail.status).toBe(400);
    expect(invalidPassword.status).toBe(400);
    expect(
      body<{ error: { code: string } }>(invalidPassword).error.code,
    ).toBe('INVALID_PASSWORD');
  });

  it('inicia sesión y devuelve token Bearer con expiración y perfil seguro', async () => {
    const context = setup();
    await register(context.api);

    const response = await login(context.api);
    const result = body<{
      accessToken: string;
      tokenType: string;
      expiresAt: string;
      user: Record<string, unknown>;
    }>(response);

    expect(response.status).toBe(200);
    expect(result.tokenType).toBe('Bearer');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(result.user).toEqual({ id: 'user-1', email: 'user@example.com' });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('responde igual para contraseña incorrecta y correo inexistente', async () => {
    const context = setup();
    await register(context.api);

    const wrongPassword = await context.api.post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'wrong-password',
    });
    const missingEmail = await context.api.post('/api/auth/login').send({
      email: 'missing@example.com',
      password: 'correct-password',
    });

    expect(wrongPassword.status).toBe(401);
    expect(missingEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(missingEmail.body);
  });

  it('permite consultar el perfil propio con un token válido', async () => {
    const context = setup();
    await register(context.api);
    const loginResponse = await login(context.api);
    const token = body<{ accessToken: string }>(loginResponse).accessToken;

    const response = await context.api
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
  });

  it.each([
    ['sin token', undefined],
    ['token malformado', 'Basic abc'],
    ['token inválido', 'Bearer invalid.token.value'],
  ])('rechaza el perfil %s', async (_case, authorization) => {
    const context = setup();
    const call = context.api.get('/api/users/me');
    if (authorization) {
      call.set('Authorization', authorization);
    }

    const response = await call;

    expect(response.status).toBe(401);
    expect(body<{ error: { code: string } }>(response).error.code).toBe(
      'UNAUTHORIZED',
    );
  });

  it('rechaza un token expirado', async () => {
    const context = setup(-1);
    await register(context.api);
    const loginResponse = await login(context.api);
    const token = body<{ accessToken: string }>(loginResponse).accessToken;

    const response = await context.api
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
