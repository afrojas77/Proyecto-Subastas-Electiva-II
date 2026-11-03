import { AuthenticationRequiredError } from '../errors/authentication-required.error';
import type { UserRepository } from '../../domain/ports/user.repository';
import { toUserProfile, type UserProfile } from './user-profile';

export class GetAuthenticatedProfile {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AuthenticationRequiredError();
    }
    return toUserProfile(user);
  }
}
