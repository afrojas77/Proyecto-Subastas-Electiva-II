import type { Request, Response } from 'express';

import { GetAuthenticatedProfile } from '../../../application/use-cases/get-authenticated-profile';
import { RegisterUser } from '../../../application/use-cases/register-user';
import { getAuthenticatedUserId } from '../authentication-request';
import { requireBody, requireString } from '../request-helpers';

export class UserController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly getAuthenticatedProfile: GetAuthenticatedProfile,
  ) {}

  register = async (request: Request, response: Response): Promise<void> => {
    const body = requireBody(request.body);
    const profile = await this.registerUser.execute({
      name: requireString(body, 'name'),
      documentType: requireString(body, 'documentType'),
      documentNumber: requireString(body, 'documentNumber'),
      phone: requireString(body, 'phone'),
      email: requireString(body, 'email'),
      password: requireString(body, 'password'),
    });
    response.status(201).json(profile);
  };

  me = async (request: Request, response: Response): Promise<void> => {
    const profile = await this.getAuthenticatedProfile.execute(
      getAuthenticatedUserId(request),
    );
    response.status(200).json(profile);
  };
}
