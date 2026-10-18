import { downloadsOpen } from '@nomadic/config';
import ComingSoon from './ComingSoon';

interface DownloadCtaProps {
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  block?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-12 px-4 text-base',
  lg: 'min-h-16 px-6 text-lg',
};

/**
 * The site's download button: a link to /download once any platform has a release (`downloadsOpen()` in
 * packages/config/src/downloads.ts), the non-clickable "Coming soon" placeholder before that.
 */
export default function DownloadCta({
  tone = 'light',
  size = 'md',
  label = 'Download Nomadic',
  block = false,
  className = '',
}: DownloadCtaProps) {
  if (!downloadsOpen()) return <ComingSoon tone={tone} size={size} label={label} block={block} className={className} />;
  const palette =
    tone === 'dark'
      ? 'border-white bg-white text-ink hover:border-marigold hover:bg-marigold'
      : 'border-ink bg-ink text-white hover:border-ultra hover:bg-ultra';
  return (
    <a
      href="/download"
      className={`max-w-full items-center border-2 font-bold ${palette} ${SIZES[size]} ${
        block ? 'flex w-full justify-center' : 'inline-flex'
      } ${className}`}
    >
      <span className="whitespace-nowrap py-2">{label}</span>
    </a>
  );
}
