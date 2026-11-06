import type { User } from '../../domain/entities/user';

export interface UserProfile {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
}

export function toUserProfile(user: User): UserProfile {
  return Object.freeze({
    id: user.id,
    name: user.name ?? null,
    email: user.email.value,
  });
}
