import bcrypt from 'bcryptjs';

import type { PasswordHasher } from '../../application/ports/password-hasher';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = 12) {
    if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
      throw new Error('Los rounds de bcrypt deben estar entre 10 y 15.');
    }
  }

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
