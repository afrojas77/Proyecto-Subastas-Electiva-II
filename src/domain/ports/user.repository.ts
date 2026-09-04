import type { User } from '../entities/user';
import type { Email } from '../value-objects/email';

export interface UserRepository {
  existsByEmail(email: Email): Promise<boolean>;
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<void>;
}
