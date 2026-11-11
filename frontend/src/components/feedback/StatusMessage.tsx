interface StatusMessageProps {
  kind: 'error' | 'success' | 'info';
  children: string;
}

const styles = {
  error: 'border-[#a64132] bg-[#a64132]/5 text-[#7f3429]',
  success: 'border-[#386b55] bg-[#386b55]/5 text-[#315d4a]',
  info: 'border-[#a65c35] bg-[#a65c35]/5 text-[#626965]',
} as const;

export function StatusMessage({ kind, children }: StatusMessageProps) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`border-l-2 px-3 py-2 text-sm leading-5 ${styles[kind]}`}
    >
      {children}
    </p>
  );
}
