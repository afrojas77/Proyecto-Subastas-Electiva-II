import { type FormEvent, useState } from 'react';

import { BrandMark } from '../../components/brand/BrandMark';
import { StatusMessage } from '../../components/feedback/StatusMessage';
import { TextField } from '../../components/forms/TextField';
import {
  EmailIcon,
  EyeIcon,
  GoogleIcon,
  LockIcon,
} from '../../components/icons/AuthIcons';
import { ApiError } from '../../lib/api-client';
import { login } from './auth.api';
import { saveSession } from './session';

interface FieldErrors {
  email?: string;
  password?: string;
}

interface Feedback {
  kind: 'error' | 'success' | 'info';
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginPageProps {
  onCreateAccount: () => void;
  onLogin: () => void;
}

export function LoginPage({ onCreateAccount, onLogin }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateForm(email, password);
    setErrors(validationErrors);
    setFeedback(undefined);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      saveSession(result, remember);
      onLogin();
      setFeedback({
        kind: 'success',
        message: `Bienvenido${result.user.name ? `, ${result.user.name}` : ''}. Tu sesión se inició correctamente.`,
      });
    } catch (error: unknown) {
      setFeedback({
        kind: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Ocurrió un error inesperado al iniciar sesión.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  function showPendingFeature(feature: string) {
    setFeedback({
      kind: 'info',
      message: `${feature} se incorporará en una siguiente etapa del frontend.`,
    });
  }

  return (
    <main className="login-page relative overflow-hidden bg-[#f4f0e8] text-[#1c2521]">
      <div className="pointer-events-none absolute -left-52 top-1/3 size-[34rem] rounded-full border border-[#a65c35]/10" />
      <div className="pointer-events-none absolute -right-40 -top-48 size-[38rem] rounded-full border border-[#17251f]/8" />
      <div className="pointer-events-none absolute right-[12%] top-[18%] size-2 rounded-full bg-[#a65c35]/40" />

      <section className="login-layout relative z-10 flex flex-col px-6 py-4 sm:px-12 lg:px-16">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <BrandMark />
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b716d] transition hover:text-[#a65c35] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a65c35]"
            onClick={onCreateAccount}
          >
            Crear cuenta
          </button>
        </header>

        <div className="login-panel mx-auto my-auto w-full max-w-[480px] py-2">
          <div className="login-intro">
            <p className="login-eyebrow mb-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#a65c35]">
              <span className="h-px w-8 bg-current" />
              Bienvenido de nuevo
            </p>
            <h1 className="login-title font-display text-[clamp(40px,6vw,54px)] leading-[0.98] tracking-[-0.035em] text-[#15201b]">
              El arte de
              <br />
              encontrar lo{' '}
              <em className="font-normal text-[#a65c35]">único.</em>
            </h1>
            <p className="login-description mt-3 max-w-md text-[15px] leading-6 text-[#6b716d]">
              Accede a subastas excepcionales, puja en tiempo real y descubre
              piezas con historia.
            </p>
          </div>

          <div className="login-actions">
            <form
              className="login-form mt-4 space-y-3"
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              <TextField
                id="email"
                label="Correo electrónico"
                icon={<EmailIcon className="size-full" />}
                type="email"
                autoComplete="email"
                placeholder="nombre@correo.com"
                value={email}
                error={errors.email}
                className="login-input"
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email)
                    setErrors((current) => ({ ...current, email: undefined }));
                }}
              />

              <TextField
                id="password"
                label="Contraseña"
                icon={<LockIcon className="size-full" />}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Tu contraseña"
                value={password}
                error={errors.password}
                className="login-input"
                action={
                  <button
                    type="button"
                    onClick={() =>
                      showPendingFeature('La recuperación de contraseña')
                    }
                    className="text-xs font-semibold text-[#a65c35] hover:underline"
                  >
                    ¿La olvidaste?
                  </button>
                }
                endAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#818681] transition hover:text-[#a65c35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a65c35]"
                    aria-label={
                      showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                  >
                    <EyeIcon crossed={showPassword} className="size-5" />
                  </button>
                }
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password)
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                    }));
                }}
              />

              <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-[#626965]">
                <input
                  type="checkbox"
                  className="size-4 accent-[#a65c35]"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                Mantener mi sesión iniciada
              </label>

              <button
                className="login-primary-action group flex h-12 w-full items-center justify-center gap-3 bg-[#17251f] text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#a65c35] focus:outline-none focus:ring-2 focus:ring-[#a65c35] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-65"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Verificando…' : 'Iniciar sesión'}
                <span
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  →
                </span>
              </button>

              {feedback ? (
                <StatusMessage kind={feedback.kind}>
                  {feedback.message}
                </StatusMessage>
              ) : null}
            </form>

            <div className="login-divider my-3 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#999991]">
              <span className="h-px flex-1 bg-[#d7d1c6]" /> o continúa con{' '}
              <span className="h-px flex-1 bg-[#d7d1c6]" />
            </div>

            <button
              type="button"
              onClick={() => showPendingFeature('El acceso con Google')}
              className="login-secondary-action flex h-12 w-full items-center justify-center gap-3 border border-[#d3cec3] bg-white/40 text-sm font-semibold transition hover:border-[#aaa397] hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a65c35]"
            >
              <GoogleIcon className="size-5" /> Continuar con Google
            </button>

            <p className="login-register mt-3 text-center text-sm text-[#6b716d]">
              ¿Aún no tienes una cuenta?{' '}
              <button
                type="button"
                onClick={onCreateAccount}
                className="font-bold text-[#a65c35] hover:underline"
              >
                Regístrate ahora
              </button>
            </p>
          </div>
        </div>

        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#8b8e89] sm:justify-start">
          <span>© 2026 Aurea</span>
          <button
            type="button"
            className="hover:text-[#a65c35]"
            onClick={() => showPendingFeature('La política de privacidad')}
          >
            Privacidad
          </button>
          <button
            type="button"
            className="hover:text-[#a65c35]"
            onClick={() => showPendingFeature('Los términos de uso')}
          >
            Términos
          </button>
        </footer>
      </section>
    </main>
  );
}

function validateForm(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }

  const passwordBytes = new TextEncoder().encode(password).length;
  if (password.length < 8 || passwordBytes > 72) {
    errors.password = 'La contraseña debe tener minimo 8 caracteres.';
  }
  return errors;
}
