import React, { useEffect, useRef } from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { applyHead, matchRoute } from './lib/seo';
import { Nav, Footer } from './components/Chrome';
import Home from './pages/Home';
import Download from './pages/Download';
import Legal from './pages/Legal';
import NotFound from './pages/NotFound';

function Routes() {
  const { path } = useRouter();
  const route = matchRoute(path);
  const first = useRef(true);

  useEffect(() => {
    // The prerendered HTML already has the right <head>; only update it on navigation.
    if (first.current) {
      first.current = false;
      return;
    }
    applyHead(route);
  }, [route]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        {route.id === 'home' && <Home />}
        {route.id === 'download' && <Download />}
        {route.id === 'terms' && <Legal type="terms" />}
        {route.id === 'privacy' && <Legal type="privacy" />}
        {route.id === 'notfound' && <NotFound />}
      </main>
      <Footer />
    </>
  );
}

export default function App({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <RouterProvider initialPath={url}>
      <Routes />
      {children}
    </RouterProvider>
  );
}
