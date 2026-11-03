export interface AccessTokenPayload {
  readonly userId: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface AccessTokenService {
  issue(payload: AccessTokenPayload): IssuedAccessToken;
  verify(token: string): AccessTokenPayload;
}
