import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import ComingSoon from './ComingSoon';
import { scrollToId } from '../hooks';

const LINKS: { label: string; id: string }[] = [
  { label: 'Learn', id: 'learn' },
  { label: 'Find', id: 'find' },
  { label: 'Apply', id: 'apply' },
  { label: 'Track', id: 'track' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'Questions', id: 'faq' },
];

function Brand() {
  return (
    <a href="#/" className="flex items-center gap-2.5">
      <img src="./logo-icon.png" alt="" className="h-8 w-8 object-contain" />
      <span className="wide text-lg">Nomadic</span>
    </a>
  );
}

/** `home` shows the in-page section links. `page` is the plain header used by inner pages. */
export default function Nav({ variant = 'home' }: { variant?: 'home' | 'page' }) {
  const [open, setOpen] = useState(false);

  const go = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(false);
    scrollToId(id);
  };

  if (variant === 'page') {
    return (
      <header className="border-b border-rule bg-fog">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <a href="#/" className="font-semibold underline decoration-2 underline-offset-4 hover:text-ultra">
            Back to the site
          </a>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-fog">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />

        <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={go(link.id)}
              className="text-[15px] font-semibold text-ink-soft hover:text-ink hover:underline hover:decoration-2 hover:underline-offset-8"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ComingSoon size="sm" label="Download" className="hidden sm:inline-flex" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center border-2 border-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-rule bg-fog lg:hidden">
          <nav aria-label="Sections" className="mx-auto flex max-w-6xl flex-col px-4 py-4 sm:px-6">
            {LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={go(link.id)}
                className="wide border-b border-rule py-4 text-2xl"
              >
                {link.label}
              </a>
            ))}
            <ComingSoon block className="mt-5" />
          </nav>
        </div>
      )}
    </header>
  );
}
