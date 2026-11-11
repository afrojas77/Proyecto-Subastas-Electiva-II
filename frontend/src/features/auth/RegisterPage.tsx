import { type FormEvent, useState } from 'react';

import { BrandMark } from '../../components/brand/BrandMark';
import { StatusMessage } from '../../components/feedback/StatusMessage';
import { TextField } from '../../components/forms/TextField';
import { EmailIcon, EyeIcon, LockIcon } from '../../components/icons/AuthIcons';
import { ApiError } from '../../lib/api-client';
import { register } from './auth.api';
import type { RegisterData } from './auth.types';

interface RegisterPageProps {
  onBackToLogin: () => void;
}

type FieldErrors = Partial<Record<keyof RegisterData, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENT_PATTERN = /^[A-Za-z0-9-]{5,30}$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

const initialForm: RegisterData = {
  name: '',
  documentType: 'CC',
  documentNumber: '',
  email: '',
  phone: '',
  password: '',
};

export function RegisterPage({ onBackToLogin }: RegisterPageProps) {
  const [form, setForm] = useState<RegisterData>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const [registered, setRegistered] = useState(false);

  function updateField<Key extends keyof RegisterData>(
    field: Key,
    value: RegisterData[Key],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    setFeedback(undefined);

    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        ...form,
        name: form.name.trim(),
        documentNumber: form.documentNumber.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      setRegistered(true);
      setFeedback(
        'Tu cuenta fue creada correctamente. Ya puedes iniciar sesión.',
      );
    } catch (error: unknown) {
      setFeedback(
        error instanceof ApiError
          ? error.message
          : 'Ocurrió un error inesperado al crear la cuenta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="register-page relative min-h-dvh overflow-x-hidden bg-[#f4f0e8] text-[#1c2521]">
      <div className="pointer-events-none absolute -left-52 top-1/4 size-[34rem] rounded-full border border-[#a65c35]/10" />
      <div className="pointer-events-none absolute -right-40 -top-48 size-[38rem] rounded-full border border-[#17251f]/8" />

      <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-5 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between">
          <BrandMark />
          <button
            type="button"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b716d] transition hover:text-[#a65c35]"
            onClick={onBackToLogin}
          >
            <span aria-hidden="true">←</span> Volver al inicio
          </button>
        </header>

        <div className="my-auto grid gap-8 py-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:gap-16">
          <div>
            <p className="mb-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#a65c35]">
              <span className="h-px w-8 bg-current" /> Únete a Aurea
            </p>
            <h1 className="font-display text-[clamp(38px,5vw,58px)] leading-[1.02] tracking-[-0.035em] text-[#15201b]">
              Tu próxima pieza
              <br />
              <em className="font-normal text-[#a65c35]">te está esperando.</em>
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-6 text-[#6b716d]">
              Crea tu perfil para participar de forma segura en nuestras
              subastas y seguir cada una de tus pujas.
            </p>
          </div>

          <div className="rounded-sm border border-[#d9d2c6] bg-white/45 p-5 shadow-[0_24px_70px_rgba(38,31,24,0.07)] sm:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9b745e]">
                  Datos personales
                </p>
                <h2 className="font-display text-3xl text-[#17251f]">
                  Crear cuenta
                </h2>
              </div>
              <span className="text-xs text-[#858983]">
                Todos los campos son obligatorios
              </span>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="name"
                  label="Nombre completo"
                  icon={<PersonIcon />}
                  autoComplete="name"
                  placeholder="Ej. Andrea Rojas"
                  value={form.name}
                  error={errors.name}
                  disabled={registered}
                  onChange={(event) => updateField('name', event.target.value)}
                />

                <label className="block" htmlFor="documentType">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.13em] text-[#3f4844]">
                    Tipo de documento
                  </span>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#818681]">
                      <DocumentIcon />
                    </span>
                    <select
                      id="documentType"
                      className="h-12 w-full appearance-none rounded-sm border border-[#d3cec3] bg-white/50 pl-12 pr-10 text-[15px] outline-none transition focus:border-[#a65c35] focus:bg-white focus:ring-2 focus:ring-[#a65c35]/10"
                      value={form.documentType}
                      disabled={registered}
                      onChange={(event) =>
                        updateField(
                          'documentType',
                          event.target.value as RegisterData['documentType'],
                        )
                      }
                    >
                      <option value="CC">Cédula de ciudadanía</option>
                      <option value="CE">Cédula de extranjería</option>
                      <option value="PASSPORT">Pasaporte</option>
                    </select>
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#818681]">
                      ⌄
                    </span>
                  </span>
                </label>

                <TextField
                  id="documentNumber"
                  label="Número de documento"
                  icon={<DocumentIcon />}
                  inputMode="text"
                  placeholder="Ej. 1032456789"
                  value={form.documentNumber}
                  error={errors.documentNumber}
                  disabled={registered}
                  onChange={(event) =>
                    updateField('documentNumber', event.target.value)
                  }
                />

                <TextField
                  id="email"
                  label="Correo electrónico"
                  icon={<EmailIcon className="size-full" />}
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@correo.com"
                  value={form.email}
                  error={errors.email}
                  disabled={registered}
                  onChange={(event) => updateField('email', event.target.value)}
                />

                <TextField
                  id="phone"
                  label="Teléfono"
                  icon={<PhoneIcon />}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Ej. 3001234567"
                  value={form.phone}
                  error={errors.phone}
                  disabled={registered}
                  onChange={(event) => updateField('phone', event.target.value)}
                />

                <TextField
                  id="registerPassword"
                  label="Clave de inicio"
                  icon={<LockIcon className="size-full" />}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  error={errors.password}
                  disabled={registered}
                  endAdornment={
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#818681] hover:text-[#a65c35]"
                      aria-label={
                        showPassword ? 'Ocultar clave' : 'Mostrar clave'
                      }
                    >
                      <EyeIcon crossed={showPassword} className="size-5" />
                    </button>
                  }
                  onChange={(event) =>
                    updateField('password', event.target.value)
                  }
                />
              </div>

              <div className="mt-5">
                {feedback ? (
                  <StatusMessage kind={registered ? 'success' : 'error'}>
                    {feedback}
                  </StatusMessage>
                ) : null}

                {registered ? (
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="mt-4 flex h-12 w-full items-center justify-center bg-[#17251f] text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#a65c35]"
                  >
                    Ir a iniciar sesión →
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex h-12 w-full items-center justify-center gap-3 bg-[#17251f] text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#a65c35] disabled:cursor-wait disabled:opacity-65"
                  >
                    {submitting ? 'Creando cuenta…' : 'Crear mi cuenta'}
                    <span
                      className="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <footer className="text-center text-[11px] text-[#8b8e89] sm:text-left">
          © 2026 Aurea · Subastas con historia
        </footer>
      </section>
    </main>
  );
}

function validateForm(form: RegisterData): FieldErrors {
  const errors: FieldErrors = {};
  if (form.name.trim().length < 3) errors.name = 'Ingresa tu nombre completo.';
  if (!DOCUMENT_PATTERN.test(form.documentNumber.trim())) {
    errors.documentNumber = 'Ingresa un documento válido (5 a 30 caracteres).';
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }
  if (!PHONE_PATTERN.test(form.phone.trim())) {
    errors.phone = 'Usa entre 7 y 15 dígitos; puedes incluir + al inicio.';
  }
  const passwordBytes = new TextEncoder().encode(form.password).length;
  if (form.password.length < 8 || passwordBytes > 72) {
    errors.password = 'La clave debe tener entre 8 caracteres y 72 bytes.';
  }
  return errors;
}

function PersonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-full"
      aria-hidden="true"
    >
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-full"
      aria-hidden="true"
    >
      <path
        d="M7 3h7l4 4v14H7V3Zm7 0v5h4M10 12h5m-5 4h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-full"
      aria-hidden="true"
    >
      <path
        d="M7.5 3h3l1 5-2 1.5a14 14 0 0 0 5 5L16 12.5l5 1v3A4.5 4.5 0 0 1 16.5 21C9 21 3 15 3 7.5A4.5 4.5 0 0 1 7.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
