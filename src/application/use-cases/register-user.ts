import { DuplicateEmailError } from '../errors/duplicate-email.error';
import { InvalidPasswordError } from '../errors/invalid-password.error';
import type { IdGenerator } from '../ports/id-generator';
import type { PasswordHasher } from '../ports/password-hasher';
import { User } from '../../domain/entities/user';
import type { UserRepository } from '../../domain/ports/user.repository';
import { Email } from '../../domain/value-objects/email';
import { toUserProfile, type UserProfile } from './user-profile';

export interface RegisterUserCommand {
  readonly name: string;
  readonly documentType?: string;
  readonly documentNumber?: string;
  readonly phone?: string;
  readonly email: string;
  readonly password: string;
}

export class RegisterUser {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RegisterUserCommand): Promise<UserProfile> {
    const email = new Email(command.email);
    validatePassword(command.password);
    if (await this.userRepository.existsByEmail(email)) {
      throw new DuplicateEmailError();
    }
    const passwordHash = await this.passwordHasher.hash(command.password);
    const user = new User(
      this.idGenerator.generate(),
      email,
      passwordHash,
      command.name,
      command.documentType,
      command.documentNumber,
      command.phone,
    );
    await this.userRepository.save(user);
    return toUserProfile(user);
  }
}

function validatePassword(password: string): void {
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (password.length < 8 || byteLength > 72) {
    throw new InvalidPasswordError();
  }
}
