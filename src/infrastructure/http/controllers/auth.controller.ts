import type { Request, Response } from 'express';

import { LoginUser } from '../../../application/use-cases/login-user';
import { requireBody, requireString } from '../request-helpers';

export class AuthController {
  constructor(private readonly loginUser: LoginUser) {}

  login = async (request: Request, response: Response): Promise<void> => {
    const body = requireBody(request.body);
    const result = await this.loginUser.execute({
      email: requireString(body, 'email'),
      password: requireString(body, 'password'),
    });
    response.status(200).json({
      accessToken: result.token,
      tokenType: 'Bearer',
      expiresAt: result.expiresAt,
      user: result.user,
    });
  };
}
