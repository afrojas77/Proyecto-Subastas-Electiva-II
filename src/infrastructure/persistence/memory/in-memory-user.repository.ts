import type { User } from '../../../domain/entities/user';
import type { UserRepository } from '../../../domain/ports/user.repository';
import type { Email } from '../../../domain/value-objects/email';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  existsByEmail(email: Email): Promise<boolean> {
    return Promise.resolve(
      [...this.users.values()].some((user) => user.email.equals(email)),
    );
  }

  findById(id: string): Promise<User | undefined> {
    return Promise.resolve(this.users.get(id));
  }

  save(user: User): Promise<void> {
    this.users.set(user.id, user);
    return Promise.resolve();
  }
}
