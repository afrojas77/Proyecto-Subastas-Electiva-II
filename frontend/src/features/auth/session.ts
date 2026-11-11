import type { LoginResponse } from './auth.types';

const SESSION_KEY = 'aurea.auth.session';

export function saveSession(session: LoginResponse, remember: boolean): void {
  const targetStorage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  otherStorage.removeItem(SESSION_KEY);
  targetStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): LoginResponse | undefined {
  const stored =
    sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!stored) return undefined;

  try {
    return JSON.parse(stored) as LoginResponse;
  } catch {
    clearSession();
    return undefined;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
