import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import DownloadCta from './DownloadCta';
import Logo from './Logo';
import { scrollToId, useScrollProgress, useScrollSpy } from '../hooks';

const LINKS: { label: string; id: string }[] = [
  { label: 'Learn', id: 'learn' },
  { label: 'Find', id: 'find' },
  { label: 'Apply', id: 'apply' },
  { label: 'Track', id: 'track' },
  { label: 'Privacy', id: 'privacy' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'Questions', id: 'faq' },
];

const IDS = LINKS.map((link) => link.id);

function Brand() {
  return (
    <a href="/" aria-label="Nomadic home" className="inline-flex min-h-11 items-center">
      <Logo className="h-6 min-[400px]:h-7" />
    </a>
  );
}

/** `home` shows the in-page section links. `page` is the plain header used by inner pages. */
export default function Nav({ variant = 'home' }: { variant?: 'home' | 'page' }) {
  const [open, setOpen] = useState(false);
  const progress = useScrollProgress();
  const active = useScrollSpy(variant === 'home' ? IDS : []);

  // Escape closes the menu, and a wider window makes the open menu pointless.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [open]);

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(false);
    scrollToId(id);
  };

  if (variant === 'page') {
    return (
      <header className="sticky top-0 z-50 border-b border-rule bg-fog">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 [@media(max-height:480px)]:h-12">
          <Brand />
          <a
            href="/"
            className="inline-flex min-h-11 items-center font-semibold underline decoration-2 underline-offset-4 hover:text-ultra"
          >
            Back to site
          </a>
        </div>
        <span ref={progress} aria-hidden className="scroll-bar absolute inset-x-0 -bottom-px h-[3px]" />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-fog">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 [@media(max-height:480px)]:h-12">
        <Brand />

        <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={go(link.id)}
              data-active={active === link.id}
              aria-current={active === link.id ? 'location' : undefined}
              className="nav-link text-[15px] font-semibold text-ink-soft hover:text-ink data-[active=true]:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <DownloadCta size="sm" label="Download" className="hidden sm:inline-flex" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center border-2 border-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-rule bg-fog lg:hidden [@media(max-height:480px)]:max-h-[calc(100dvh-3rem)]"
        >
          <nav aria-label="Sections" className="mx-auto flex max-w-6xl flex-col px-4 py-4 sm:px-6">
            {LINKS.map((link, index) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={go(link.id)}
                aria-current={active === link.id ? 'location' : undefined}
                style={{ '--d': `${index * 40}ms` } as React.CSSProperties}
                className="wide anim-slide border-b border-rule py-4 text-2xl aria-[current=location]:text-ultra [@media(max-height:480px)]:py-2.5 [@media(max-height:480px)]:text-xl"
              >
                {link.label}
              </a>
            ))}
            <DownloadCta block className="mt-5" />
          </nav>
        </div>
      )}

      <span ref={progress} aria-hidden className="scroll-bar absolute inset-x-0 -bottom-px h-[3px]" />
    </header>
  );
}
