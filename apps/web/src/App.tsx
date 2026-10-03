import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Home from './pages/Home';
import Download from './pages/Download';
import Legal from './pages/Legal';
import NotFound from './pages/NotFound';
import { applyHead, PageId, pageForPath } from './seo';
import { jsonLd } from './jsonld';
import { prefersReducedMotion } from './hooks';

/** Structured data is written for the first page at build time; moving to another page swaps it for that page's. */
function syncStructuredData(id: PageId) {
  const data = jsonLd(id);
  let script = document.getElementById('ld-json');
  if (!data) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = 'ld-json';
    script.setAttribute('type', 'application/ld+json');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

// Links from before the move to real paths looked like /#/download. They still land in the right place.
const LEGACY_HASH: Record<string, string> = {
  '#/': '/',
  '#/download': '/download',
  '#/terms': '/terms',
  '#/privacy': '/privacy',
};

interface AppProps {
  /** Set when rendering to a string at build time. In the browser the URL is read instead. */
  initialPath?: string;
}

function App({ initialPath }: AppProps) {
  const [path, setPath] = useState(() => initialPath ?? window.location.pathname);
  const page = pageForPath(path);
  const firstRender = useRef(true);

  // Moves to a new path. The browser cross-fades the two pages where View Transitions are supported.
  const go = useCallback((to: string) => {
    const url = new URL(to, window.location.origin);
    const apply = () => {
      window.history.pushState(null, '', url.pathname + url.search + url.hash);
      setPath(url.pathname);
    };
    if ('startViewTransition' in document && !prefersReducedMotion()) {
      (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(() =>
        flushSync(apply),
      );
    } else {
      apply();
    }
  }, []);

  useEffect(() => {
    const legacy = LEGACY_HASH[window.location.hash.replace(/\/$/, '') || '#/'];
    if (window.location.hash.startsWith('#/') && legacy) {
      window.history.replaceState(null, '', legacy);
      setPath(legacy);
    }

    const onPop = () => setPath(window.location.pathname);

    // Internal links change the page without a reload. Anything unusual falls back to the browser.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (pageForPath(url.pathname) === 'notfound') return;

      if (url.pathname === window.location.pathname) {
        // Same page: a hash link is the browser's job. A plain link to this page just returns to the top.
        if (url.hash) return;
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        return;
      }

      event.preventDefault();
      go(url.pathname + url.search + url.hash);
    };

    window.addEventListener('popstate', onPop);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, [go]);

  // Real page changes reset the scroll. The first render keeps the browser's own position
  // and the structured data that was written into the prerendered page.
  useEffect(() => {
    const first = firstRender.current;
    firstRender.current = false;
    // The first page already has its tags from the prerendered HTML. Later pages rewrite them.
    if (!first) {
      applyHead(page);
      syncStructuredData(page);
      window.scrollTo(0, 0);
    }
  }, [page]);

  return (
    <>
      {page === 'home' && <Home />}
      {page === 'download' && <Download />}
      {page === 'terms' && <Legal type="terms" />}
      {page === 'privacy' && <Legal type="privacy" />}
      {page === 'refunds' && <Legal type="refunds" />}
      {page === 'notfound' && <NotFound />}
    </>
  );
}

export default App;
