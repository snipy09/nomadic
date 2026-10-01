import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { SITE, ALPHA } from '../config/site';

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return <img src="/logo-64.png" alt="" width={64} height={64} className={`${className} rounded-[7px]`} />;
}

const NAV = [
  { href: '/#learn', label: 'Learn' },
  { href: '/#discover', label: 'Jobs' },
  { href: '/#apply', label: 'Auto Apply' },
  { href: '/#privacy', label: 'Privacy' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overDark, setOverDark] = useState(false);
  const { path } = useRouter();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      // Switch to dark glass while the bar sits over a dark section.
      const y = 28;
      setOverDark(
        [...document.querySelectorAll<HTMLElement>('[data-theme="dark"]')].some((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= y && r.bottom >= y;
        }),
      );
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [path]);
  const dark = overDark && !open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,color] duration-500 ${
        dark ? 'glass-dark text-white' : scrolled || open ? 'glass shadow-[0_1px_0_rgba(0,0,0,0.08)]' : 'bg-transparent'
      }`}
    >
      <nav aria-label="Main" className="container-page flex h-12 items-center justify-between sm:h-14">
        <Link href="/" className="flex items-center gap-2" aria-label="Nomadic home">
          <Logo />
          <span className="text-[17px] font-semibold tracking-headline">{SITE.name}</span>
        </Link>

        <ul className={`hidden items-center gap-7 text-[13px] md:flex ${dark ? 'text-white/80' : 'text-ink/80'}`}>
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={`transition-colors ${dark ? 'hover:text-white' : 'hover:text-ink'}`}>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link href="/download" className="btn-primary px-4 py-1.5 text-[13px]">
            Join alpha · ₹{ALPHA.price}
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="grid h-9 w-9 place-items-center rounded-full md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <div className={`collapse md:hidden`} data-open={open}>
        <div>
          <ul className="container-page space-y-1 pb-6 pt-2">
            {NAV.map((n, i) => (
              <li
                key={n.href}
                className="transition-all duration-500 ease-spring"
                style={{
                  transitionDelay: open ? `${i * 40}ms` : '0ms',
                  opacity: open ? 1 : 0,
                  transform: open ? 'none' : 'translateY(-8px)',
                }}
              >
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-line/60 py-3 text-2xl font-semibold tracking-headline"
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const cols = [
    {
      title: 'Product',
      links: [
        { href: '/#learn', label: 'Learn' },
        { href: '/#discover', label: 'Job feed' },
        { href: '/#apply', label: 'Auto apply' },
        { href: '/#track', label: 'Tracker & outreach' },
        { href: '/#pricing', label: 'Pricing' },
      ],
    },
    {
      title: 'Get started',
      links: [
        { href: '/download', label: 'Join the alpha' },
        { href: '/#faq', label: 'FAQ' },
        { href: SITE.whatsapp, label: 'Contact on WhatsApp' },
        { href: `mailto:${SITE.supportEmail}`, label: SITE.supportEmail },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' },
      ],
    },
  ];

  return (
    <footer className="bg-mist text-xs text-muted">
      <div className="container-page py-12">
        <div className="grid gap-10 border-b border-line pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <Logo className="h-5 w-5" />
              <span className="text-[15px] font-semibold">{SITE.name}</span>
            </Link>
            <p className="max-w-xs leading-relaxed">
              Career learning, job discovery and application automation in one desktop app for{' '}
              {SITE.platforms.join(', ')}.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="mb-3 font-semibold text-ink">{c.title}</h2>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition-colors hover:text-ink hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-2 pt-6 sm:flex-row">
          <p>© {new Date().getFullYear()} {SITE.legalName}. All rights reserved.</p>
          <p>Made for job seekers, everywhere.</p>
        </div>
      </div>
    </footer>
  );
}

/** macOS-style window frame used by all product mockups. */
export function AppWindow({
  title,
  children,
  dark,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl ring-1 ${
        dark ? 'bg-night-card text-night-text ring-white/10' : 'bg-white text-ink ring-black/[0.06]'
      } shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25),0_10px_30px_-15px_rgba(0,0,0,0.15)] ${className}`}
    >
      <div
        className={`flex h-9 items-center gap-2 border-b px-4 ${
          dark ? 'border-white/10 bg-white/[0.03]' : 'border-black/[0.06] bg-[#fbfbfd]'
        }`}
      >
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className={`ml-3 truncate text-[11px] font-medium ${dark ? 'text-night-muted' : 'text-faint'}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}
