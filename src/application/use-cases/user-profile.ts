import type { User } from '../../domain/entities/user';

export interface UserProfile {
  readonly id: string;
  readonly email: string;
}

export function toUserProfile(user: User): UserProfile {
  return Object.freeze({ id: user.id, email: user.email.value });
}
