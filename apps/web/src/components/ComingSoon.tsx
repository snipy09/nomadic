interface ComingSoonProps {
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  block?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'min-h-9 gap-3 px-3 text-sm',
  md: 'min-h-12 gap-4 px-4 text-base',
  lg: 'min-h-16 gap-4 px-4 text-base sm:gap-5 sm:px-6 sm:text-lg',
};

/**
 * Stands in for the download button until public downloads open.
 * It is deliberately not a link or a button: there is nothing to click yet.
 */
export default function ComingSoon({
  tone = 'light',
  size = 'md',
  label = 'Download Nomadic',
  block = false,
  className = '',
}: ComingSoonProps) {
  const palette = tone === 'dark' ? 'border-white/70 text-white' : 'border-ink text-ink';
  const soon = tone === 'dark' ? 'text-marigold' : 'text-ultra';

  return (
    <div
      className={`cursor-not-allowed select-none items-center border-2 border-dashed ${palette} ${SIZES[size]} ${
        block ? 'flex w-full justify-between' : 'inline-flex'
      } ${className}`}
    >
      <span className="whitespace-nowrap py-2 font-bold">{label}</span>
      <span aria-hidden className="w-px self-stretch bg-current opacity-40" />
      <span className={`whitespace-nowrap py-2 font-bold ${soon}`}>
        <span className="sr-only">: </span>
        Coming soon
      </span>
    </div>
  );
}
