import type { Request } from 'express';

import { AuthenticationRequiredError } from '../../application/errors/authentication-required.error';

type RequestWithAuthentication = Request & {
  authenticatedUserId?: string;
};

export function setAuthenticatedUserId(
  request: Request,
  userId: string,
): void {
  (request as RequestWithAuthentication).authenticatedUserId = userId;
}

export function getAuthenticatedUserId(request: Request): string {
  const userId = (request as RequestWithAuthentication).authenticatedUserId;
  if (!userId) {
    throw new AuthenticationRequiredError();
  }
  return userId;
}
