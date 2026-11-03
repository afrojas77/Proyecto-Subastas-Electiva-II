import jwt, { type JwtPayload } from 'jsonwebtoken';

import type {
  AccessTokenPayload,
  AccessTokenService,
  IssuedAccessToken,
} from '../../application/ports/access-token-service';

const ISSUER = 'proyecto-subastas-api';
const AUDIENCE = 'proyecto-subastas-client';

export class JwtAccessTokenService implements AccessTokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresInSeconds: number,
  ) {}

  issue(payload: AccessTokenPayload): IssuedAccessToken {
    const token = jwt.sign({}, this.secret, {
      algorithm: 'HS256',
      audience: AUDIENCE,
      expiresIn: this.expiresInSeconds,
      issuer: ISSUER,
      subject: payload.userId,
    });
    return Object.freeze({
      token,
      expiresAt: new Date(Date.now() + this.expiresInSeconds * 1000),
    });
  }

  verify(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, this.secret, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
      issuer: ISSUER,
    });
    if (!isJwtPayload(payload) || typeof payload.sub !== 'string') {
      throw new Error('El token no contiene una identidad válida.');
    }
    return Object.freeze({ userId: payload.sub });
  }
}

function isJwtPayload(value: string | JwtPayload): value is JwtPayload {
  return typeof value !== 'string';
}
