import { apiRequest } from '../../lib/api-client';
import type {
  LoginCredentials,
  LoginResponse,
  RegisterData,
  RegisteredUser,
} from './auth.types';

export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
}

export function register(data: RegisterData): Promise<RegisteredUser> {
  return apiRequest<RegisteredUser>('/api/users/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
