import { InvalidCredentialsError } from '../errors/invalid-credentials.error';
import type {
  AccessTokenService,
  IssuedAccessToken,
} from '../ports/access-token-service';
import type { PasswordHasher } from '../ports/password-hasher';
import type { UserRepository } from '../../domain/ports/user.repository';
import { InvalidEmailError } from '../../domain/errors/invalid-email.error';
import { Email } from '../../domain/value-objects/email';
import { toUserProfile, type UserProfile } from './user-profile';

export interface LoginUserCommand {
  readonly email: string;
  readonly password: string;
}

export interface LoginUserResult extends IssuedAccessToken {
  readonly user: UserProfile;
}

export class LoginUser {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokenService: AccessTokenService,
  ) {}

  async execute(command: LoginUserCommand): Promise<LoginUserResult> {
    const email = parseLoginEmail(command.email);
    const user = await this.userRepository.findByEmail(email);
    if (
      !user?.passwordHash ||
      !(await this.passwordHasher.verify(command.password, user.passwordHash))
    ) {
      throw new InvalidCredentialsError();
    }
    const issued = this.accessTokenService.issue({ userId: user.id });
    return Object.freeze({ ...issued, user: toUserProfile(user) });
  }
}

function parseLoginEmail(value: string): Email {
  try {
    return new Email(value);
  } catch (error: unknown) {
    if (error instanceof InvalidEmailError) {
      throw new InvalidCredentialsError();
    }
    throw error;
  }
}
