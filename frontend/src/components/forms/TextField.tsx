import type { InputHTMLAttributes, ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: ReactNode;
  action?: ReactNode;
  endAdornment?: ReactNode;
  error?: string;
}

export function TextField({
  id,
  label,
  icon,
  action,
  endAdornment,
  error,
  className = '',
  ...inputProps
}: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 flex items-center justify-between gap-4">
        <span className="text-xs font-bold uppercase tracking-[0.13em] text-[#3f4844]">
          {label}
        </span>
        {action}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#818681]">
          {icon}
        </span>
        <input
          id={id}
          className={`h-12 w-full rounded-sm border bg-white/50 pl-12 text-[15px] text-[#1c2521] outline-none transition placeholder:text-[#a4a59f] focus:bg-white focus:ring-2 ${
            error
              ? 'border-[#a64132] focus:border-[#a64132] focus:ring-[#a64132]/10'
              : 'border-[#d3cec3] focus:border-[#a65c35] focus:ring-[#a65c35]/10'
          } ${endAdornment ? 'pr-12' : 'pr-4'} ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {endAdornment}
      </span>
      {error ? (
        <span
          id={errorId}
          className="mt-2 block text-xs leading-5 text-[#963e31]"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}
