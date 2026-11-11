import { useState } from 'react';

import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { getSession } from './features/auth/session';
import { DashboardPage } from './features/dashboard/DashboardPage';

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'dashboard'>(() =>
    getSession() ? 'dashboard' : 'login',
  );

  if (view === 'dashboard') {
    return <DashboardPage onLogout={() => setView('login')} />;
  }

  return view === 'register' ? (
    <RegisterPage onBackToLogin={() => setView('login')} />
  ) : (
    <LoginPage
      onCreateAccount={() => setView('register')}
      onLogin={() => setView('dashboard')}
    />
  );
}
