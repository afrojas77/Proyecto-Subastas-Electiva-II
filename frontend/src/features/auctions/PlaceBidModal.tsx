import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { StatusMessage } from '../../components/feedback/StatusMessage';
import { ApiError } from '../../lib/api-client';
import {
  getAuctionDetail,
  placeBid,
  type AuctionDetail,
  type AuctionSummary,
} from './auction.api';

interface PlaceBidModalProps {
  auction: AuctionSummary;
  accessToken: string;
  currentUserId: string;
  onClose: () => void;
  onBidAccepted: () => void;
}

export function PlaceBidModal({
  auction,
  accessToken,
  currentUserId,
  onClose,
  onBidAccepted,
}: PlaceBidModalProps) {
  const [detail, setDetail] = useState<AuctionDetail>();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'error' | 'success';
    message: string;
  }>();

  useEffect(() => {
    let mounted = true;
    void getAuctionDetail(auction.id, accessToken)
      .then((result) => {
        if (mounted) setDetail(result);
      })
      .catch((caught: unknown) => {
        if (mounted) {
          setFeedback({ kind: 'error', message: errorMessage(caught) });
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [accessToken, auction.id]);

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose, submitting]);

  const minimumBid = useMemo(
    () =>
      detail?.highestBid
        ? detail.highestBid.amount + detail.minimumIncrement
        : auction.basePrice,
    [auction.basePrice, detail],
  );
  const isSeller = auction.sellerId === currentUserId;
  const alreadyLeading = detail?.highestBid?.bidderId === currentUserId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    const numericAmount = Number(amount);

    if (isSeller) {
      setFeedback({
        kind: 'error',
        message: 'No puedes pujar en una subasta que tú mismo publicaste.',
      });
      return;
    }
    if (alreadyLeading) {
      setFeedback({
        kind: 'error',
        message: 'Ya tienes la puja líder de esta subasta.',
      });
      return;
    }
    if (!Number.isSafeInteger(numericAmount) || numericAmount < minimumBid) {
      setFeedback({
        kind: 'error',
        message: `La puja mínima permitida es ${formatCurrency(minimumBid)}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const bid = await placeBid(auction.id, numericAmount, accessToken);
      setDetail((current) =>
        current
          ? { ...current, highestBid: bid, bids: [...current.bids, bid] }
          : current,
      );
      setAmount('');
      setFeedback({
        kind: 'success',
        message: `Tu puja de ${formatCurrency(bid.amount)} fue aceptada. Ahora eres el líder.`,
      });
      onBidAccepted();
    } catch (caught: unknown) {
      setFeedback({ kind: 'error', message: errorMessage(caught) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1915]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-bid-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-sm border border-white/15 bg-[#f4f0e8] shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
        <div className="bg-[#31534a] px-6 py-6 text-white sm:px-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">
                {auction.category} · En vivo
              </p>
              <h2
                id="place-bid-title"
                className="mt-2 font-display text-3xl font-semibold tracking-[-0.025em]"
              >
                {auction.article.denomination}
              </h2>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/70">
                {auction.article.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/25 text-xl transition hover:bg-white hover:text-[#17251f] disabled:opacity-50"
              aria-label="Cerrar ventana de puja"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          {loading ? (
            <div className="space-y-3 py-8" aria-label="Cargando subasta">
              <div className="h-4 animate-pulse bg-[#ded8cd]" />
              <div className="h-12 animate-pulse bg-[#ded8cd]" />
              <div className="h-12 animate-pulse bg-[#ded8cd]" />
            </div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} noValidate>
              <div className="grid grid-cols-2 gap-4 border-b border-[#ddd6cb] pb-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8c908b]">
                    {detail?.highestBid ? 'Puja actual' : 'Precio base'}
                  </p>
                  <strong className="mt-1 block text-xl font-semibold tabular-nums text-[#17251f]">
                    {formatCurrency(
                      detail?.highestBid?.amount ?? auction.basePrice,
                    )}
                  </strong>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8c908b]">
                    Incremento mínimo
                  </p>
                  <strong className="mt-1 block text-xl font-semibold tabular-nums text-[#17251f]">
                    {formatCurrency(auction.minimumIncrement)}
                  </strong>
                </div>
              </div>

              <label
                htmlFor="bid-amount"
                className="mt-5 block text-xs font-bold uppercase tracking-[0.11em] text-[#3f4844]"
              >
                Tu puja
              </label>
              <p className="mt-1 text-xs text-[#777c77]">
                Mínimo permitido: {formatCurrency(minimumBid)}
              </p>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-[#747974]">
                  $
                </span>
                <input
                  id="bid-amount"
                  type="number"
                  min={minimumBid}
                  step="1"
                  inputMode="numeric"
                  value={amount}
                  disabled={
                    submitting ||
                    isSeller ||
                    alreadyLeading ||
                    detail?.status !== 'OPEN'
                  }
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (feedback?.kind === 'error') setFeedback(undefined);
                  }}
                  placeholder={String(minimumBid)}
                  className="h-12 w-full border border-[#d3cec3] bg-white/65 pl-9 pr-4 text-base font-semibold tabular-nums outline-none transition focus:border-[#a65c35] focus:bg-white focus:ring-2 focus:ring-[#a65c35]/10 disabled:cursor-not-allowed disabled:opacity-55"
                />
              </div>

              {isSeller ? (
                <div className="mt-4">
                  <StatusMessage kind="error">
                    No puedes pujar en una subasta que tú mismo publicaste.
                  </StatusMessage>
                </div>
              ) : alreadyLeading && !feedback ? (
                <div className="mt-4">
                  <StatusMessage kind="info">
                    Actualmente tienes la puja líder. Espera una nueva oferta
                    para volver a pujar.
                  </StatusMessage>
                </div>
              ) : feedback ? (
                <div className="mt-4">
                  <StatusMessage kind={feedback.kind}>
                    {feedback.message}
                  </StatusMessage>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  submitting ||
                  isSeller ||
                  alreadyLeading ||
                  detail?.status !== 'OPEN'
                }
                className="mt-5 flex h-12 w-full items-center justify-center gap-3 bg-[#17251f] text-sm font-bold uppercase tracking-[0.13em] text-white transition hover:bg-[#a65c35] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Enviando puja…' : 'Confirmar puja'}
                {!submitting ? <span aria-hidden="true">→</span> : null}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function errorMessage(caught: unknown) {
  if (!(caught instanceof ApiError)) {
    return 'Ocurrió un error inesperado al realizar la puja.';
  }
  const messages: Record<string, string> = {
    AUCTION_NOT_OPEN: 'La subasta ya no está abierta para recibir pujas.',
    SELLER_CANNOT_BID:
      'No puedes pujar en una subasta que tú mismo publicaste.',
    BID_BELOW_BASE_PRICE: 'La puja no alcanza el precio base de la subasta.',
    BID_INCREMENT_TOO_LOW:
      'La puja no cumple con el incremento mínimo requerido.',
    BIDDER_ALREADY_LEADING: 'Ya tienes la puja líder de esta subasta.',
    UNAUTHORIZED: 'Tu sesión venció. Inicia sesión nuevamente.',
  };
  return messages[caught.code] ?? caught.message;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}
