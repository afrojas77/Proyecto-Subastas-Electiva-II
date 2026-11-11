import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { StatusMessage } from '../../components/feedback/StatusMessage';
import { ApiError } from '../../lib/api-client';
import {
  publishAuction,
  type AuctionSummary,
  type PublishAuctionData,
} from './auction.api';

interface PublishAuctionModalProps {
  accessToken: string;
  onClose: () => void;
  onPublished: (auction: AuctionSummary) => void;
}

interface AuctionForm {
  denomination: string;
  description: string;
  conservationState: AuctionSummary['article']['conservationState'];
  category: string;
  basePrice: string;
  minimumIncrement: string;
  closesAt: string;
}

type FieldErrors = Partial<Record<keyof AuctionForm, string>>;

const CATEGORIES = [
  'Arte',
  'Antigüedades',
  'Coleccionables',
  'Joyas',
  'Relojes',
  'Libros',
  'Tecnología',
  'Vehículos',
  'Otros',
];

function initialForm(): AuctionForm {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setSeconds(0, 0);
  return {
    denomination: '',
    description: '',
    conservationState: 'USED',
    category: 'Arte',
    basePrice: '',
    minimumIncrement: '',
    closesAt: toLocalDateTime(tomorrow),
  };
}

export function PublishAuctionModal({
  accessToken,
  onClose,
  onPublished,
}: PublishAuctionModalProps) {
  const [form, setForm] = useState<AuctionForm>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose, submitting]);

  function update<Key extends keyof AuctionForm>(
    field: Key,
    value: AuctionForm[Key],
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

    const data: PublishAuctionData = {
      article: {
        denomination: form.denomination.trim(),
        description: form.description.trim(),
        conservationState: form.conservationState,
      },
      category: form.category,
      basePrice: Number(form.basePrice),
      minimumIncrement: Number(form.minimumIncrement),
      closesAt: new Date(form.closesAt).toISOString(),
    };

    setSubmitting(true);
    try {
      const auction = await publishAuction(data, accessToken);
      onPublished(auction);
    } catch (caught: unknown) {
      setFeedback(
        caught instanceof ApiError
          ? caught.message
          : 'Ocurrió un error inesperado al publicar la subasta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1915]/70 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-auction-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-sm border border-white/15 bg-[#f4f0e8] shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-6 border-b border-[#d9d2c6] bg-[#f4f0e8]/95 px-5 py-5 backdrop-blur sm:px-8">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a65c35]">
              Nueva publicación
            </p>
            <h2
              id="publish-auction-title"
              className="font-display text-3xl font-semibold tracking-[-0.025em] text-[#17251f]"
            >
              Publicar una subasta
            </h2>
            <p className="mt-1 text-sm text-[#747974]">
              Completa la información con la que los compradores verán tu pieza.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#d1c9bd] text-xl text-[#6f746f] transition hover:border-[#a65c35] hover:bg-[#a65c35] hover:text-white disabled:opacity-50"
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </header>

        <form
          className="px-5 py-6 sm:px-8 sm:py-7"
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
            <FormField
              id="auction-name"
              label="Nombre del artículo"
              error={errors.denomination}
            >
              <input
                id="auction-name"
                type="text"
                autoFocus
                maxLength={200}
                value={form.denomination}
                onChange={(event) => update('denomination', event.target.value)}
                placeholder="Ej. Reloj suizo de 1968"
                className={inputClass(Boolean(errors.denomination))}
              />
            </FormField>

            <FormField id="auction-category" label="Categoría">
              <select
                id="auction-category"
                value={form.category}
                onChange={(event) => update('category', event.target.value)}
                className={inputClass(false)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </FormField>

            <FormField id="auction-state" label="Estado de conservación">
              <select
                id="auction-state"
                value={form.conservationState}
                onChange={(event) =>
                  update(
                    'conservationState',
                    event.target.value as AuctionForm['conservationState'],
                  )
                }
                className={inputClass(false)}
              >
                <option value="NEW">Nuevo</option>
                <option value="LIKE_NEW">Como nuevo</option>
                <option value="USED">Usado</option>
                <option value="RESTORED">Restaurado</option>
              </select>
            </FormField>

            <FormField
              id="auction-closes-at"
              label="Fecha y hora de cierre"
              error={errors.closesAt}
              hint="Entre 1 hora y 30 días desde ahora"
            >
              <input
                id="auction-closes-at"
                type="datetime-local"
                value={form.closesAt}
                min={toLocalDateTime(new Date(Date.now() + 60 * 60 * 1000))}
                max={toLocalDateTime(
                  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                )}
                onChange={(event) => update('closesAt', event.target.value)}
                className={`${inputClass(Boolean(errors.closesAt))} tabular-nums`}
              />
            </FormField>

            <FormField
              id="auction-price"
              label="Precio base"
              error={errors.basePrice}
              hint="Valor inicial en pesos colombianos"
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#7c807b]">
                  $
                </span>
                <input
                  id="auction-price"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.basePrice}
                  onChange={(event) => update('basePrice', event.target.value)}
                  placeholder="500000"
                  className={`${inputClass(Boolean(errors.basePrice))} pl-9 tabular-nums`}
                />
              </div>
            </FormField>

            <FormField
              id="auction-increment"
              label="Incremento mínimo"
              error={errors.minimumIncrement}
              hint="Aumento mínimo permitido por cada puja"
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#7c807b]">
                  $
                </span>
                <input
                  id="auction-increment"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.minimumIncrement}
                  onChange={(event) =>
                    update('minimumIncrement', event.target.value)
                  }
                  placeholder="25000"
                  className={`${inputClass(Boolean(errors.minimumIncrement))} pl-9 tabular-nums`}
                />
              </div>
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                id="auction-description"
                label="Descripción del artículo"
                error={errors.description}
                hint={`${form.description.length}/2000 caracteres`}
              >
                <textarea
                  id="auction-description"
                  rows={4}
                  maxLength={2000}
                  value={form.description}
                  onChange={(event) =>
                    update('description', event.target.value)
                  }
                  placeholder="Describe su historia, características, autenticidad y cualquier detalle relevante para el comprador."
                  className={`${inputClass(Boolean(errors.description))} min-h-28 resize-y py-3`}
                />
              </FormField>
            </div>
          </div>

          <div className="mt-6 border-t border-[#ddd6cb] pt-5">
            {feedback ? (
              <div className="mb-4">
                <StatusMessage kind="error">{feedback}</StatusMessage>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="h-12 border border-[#cec7bb] px-6 text-sm font-semibold text-[#5f665f] transition hover:border-[#a65c35] hover:text-[#a65c35] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 items-center justify-center gap-3 bg-[#17251f] px-8 text-sm font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#a65c35] disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? 'Publicando…' : 'Publicar subasta'}
                {!submitting ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold uppercase tracking-[0.11em] text-[#3f4844]"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-[#963e31]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] text-[#8b8e89]">{hint}</p>
      ) : null}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `h-12 w-full rounded-sm border bg-white/60 px-4 text-sm text-[#1c2521] outline-none transition placeholder:text-[#aaa9a2] focus:bg-white focus:ring-2 ${
    hasError
      ? 'border-[#a64132] focus:border-[#a64132] focus:ring-[#a64132]/10'
      : 'border-[#d3cec3] focus:border-[#a65c35] focus:ring-[#a65c35]/10'
  }`;
}

function validateForm(form: AuctionForm): FieldErrors {
  const errors: FieldErrors = {};
  if (form.denomination.trim().length < 3) {
    errors.denomination = 'Ingresa un nombre de al menos 3 caracteres.';
  }
  if (form.description.trim().length < 10) {
    errors.description = 'Describe el artículo con al menos 10 caracteres.';
  }
  if (!isPositiveSafeInteger(form.basePrice)) {
    errors.basePrice = 'Ingresa un precio entero mayor que cero.';
  }
  if (!isPositiveSafeInteger(form.minimumIncrement)) {
    errors.minimumIncrement = 'Ingresa un incremento entero mayor que cero.';
  }

  const closesAt = new Date(form.closesAt).getTime();
  const duration = closesAt - Date.now();
  if (!form.closesAt || Number.isNaN(closesAt)) {
    errors.closesAt = 'Selecciona una fecha y hora válidas.';
  } else if (duration < 60 * 60 * 1000) {
    errors.closesAt = 'La subasta debe durar como mínimo una hora.';
  } else if (duration > 30 * 24 * 60 * 60 * 1000) {
    errors.closesAt = 'La subasta no puede durar más de 30 días.';
  }
  return errors;
}

function isPositiveSafeInteger(value: string) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

function toLocalDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
