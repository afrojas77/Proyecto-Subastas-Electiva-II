interface BrandMarkProps {
  inverse?: boolean;
}

export function BrandMark({ inverse = false }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center gap-3 ${inverse ? 'text-white' : 'text-[#1c2521]'}`}
      aria-label="Aurea, casa de subastas"
    >
      <div className="grid size-10 place-items-center rounded-full border border-current/25">
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 18.5h14M7.5 15.5h9M9 15.5V8.8m6 6.7V8.8M7 8.5h10L12 4 7 8.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <p className="font-display text-xl leading-none tracking-[0.08em]">
          AUREA
        </p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.32em] opacity-60">
          Casa de subastas
        </p>
      </div>
    </div>
  );
}
