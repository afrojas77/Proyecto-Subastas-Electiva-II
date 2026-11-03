import type { NextFunction, Request, Response } from 'express';

import { AuthenticationRequiredError } from '../../../application/errors/authentication-required.error';
import type { AccessTokenService } from '../../../application/ports/access-token-service';
import { setAuthenticatedUserId } from '../authentication-request';

export function createAuthenticationMiddleware(
  accessTokenService: AccessTokenService,
) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authorization = request.get('authorization');
    const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
    if (!match?.[1]) {
      next(new AuthenticationRequiredError());
      return;
    }
    try {
      const payload = accessTokenService.verify(match[1]);
      setAuthenticatedUserId(request, payload.userId);
      next();
    } catch {
      next(new AuthenticationRequiredError());
    }
  };
}
