import React, { useState } from 'react';
import { cn } from '@nomadic/ui';
import { MIN_LOGO_PX, companyLogoDomain, companyLogoUrl } from './companyLogoDomain';

const MONOGRAM_TONES = [
  'bg-accent-subtle text-accent-subtle-fg',
  'bg-success-subtle text-success-fg',
  'bg-warning-subtle text-warning-fg',
  'bg-danger-subtle text-danger-fg',
  'bg-surface-sunken text-fg',
];

/** Stable colour per company so the same company always looks the same. */
export function monogramTone(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) >>> 0;
  return MONOGRAM_TONES[h % MONOGRAM_TONES.length];
}

export type CompanyLogoSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<CompanyLogoSize, { box: string; text: string; pad: string }> = {
  xs: { box: 'size-5 rounded', text: 'text-[10px]', pad: 'p-0.5' },
  sm: { box: 'size-8 rounded-md', text: 'text-body', pad: 'p-1' },
  md: { box: 'size-10 rounded-md', text: 'text-heading', pad: 'p-1.5' },
  lg: { box: 'size-12 rounded-lg', text: 'text-title', pad: 'p-1.5' },
};

/** Domains whose logo failed in this session: they show the monogram at once instead of retrying on every render. */
const failedDomains = new Set<string>();

export function resetCompanyLogoCache(): void {
  failedDomains.clear();
}

interface CompanyLogoProps {
  company: string;
  /** Posting or careers URL: its host stands for the company when the name is not a known one. */
  url?: string | null;
  /** A domain known to belong to the company (wins over name and URL). */
  domain?: string | null;
  size?: CompanyLogoSize;
  className?: string;
}

/**
 * The company's logo on a white plate (logos are drawn for light backgrounds, also in dark mode), over its
 * monogram: the monogram shows while the image loads and stays when there is no real logo, so nothing jumps.
 * Decorative: the company name is always written next to it.
 */
export function CompanyLogo({ company, url, domain, size = 'md', className }: CompanyLogoProps) {
  const logoDomain = domain || companyLogoDomain(company, url);
  const [state, setState] = useState<{ domain: string | null; status: 'loading' | 'ok' | 'failed' }>({ domain: logoDomain, status: 'loading' });
  // A recycled element (lists) can get another company: start over for the new domain.
  const status = state.domain === logoDomain ? state.status : 'loading';
  const tryImage = Boolean(logoDomain) && status !== 'failed' && !failedDomains.has(logoDomain as string);
  const shown = tryImage && status === 'ok';
  const s = SIZE[size];
  const letter = (company.trim()[0] || '?').toUpperCase();

  const fail = () => {
    if (logoDomain) failedDomains.add(logoDomain);
    setState({ domain: logoDomain, status: 'failed' });
  };

  return (
    <span
      aria-hidden="true"
      data-company-logo={shown ? logoDomain : undefined}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden font-strong',
        s.box,
        s.text,
        // A fixed white plate is deliberate: favicons assume a light page and vanish on dark surfaces.
        shown ? 'bg-white ring-1 ring-inset ring-line' : monogramTone(company),
        className,
      )}
    >
      {!shown && letter}
      {tryImage && (
        <img
          src={companyLogoUrl(logoDomain as string)}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={(e) => {
            if (e.currentTarget.naturalWidth < MIN_LOGO_PX) fail();
            else setState({ domain: logoDomain, status: 'ok' });
          }}
          onError={fail}
          className={cn('absolute inset-0 size-full object-contain', s.pad, shown ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </span>
  );
}
