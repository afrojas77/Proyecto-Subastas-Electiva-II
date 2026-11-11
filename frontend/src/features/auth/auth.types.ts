export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: UserProfile;
}

export interface RegisterData {
  name: string;
  documentType: 'CC' | 'CE' | 'PASSPORT';
  documentNumber: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisteredUser extends UserProfile {
  documentType: RegisterData['documentType'];
  documentNumber: string;
  phone: string;
}
