import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { normalizePath } from './seo';

const RouterContext = createContext<{ path: string; navigate: (to: string) => void }>({
  path: '/',
  navigate: () => {},
});

export function RouterProvider({ initialPath, children }: { initialPath: string; children: React.ReactNode }) {
  const [path, setPath] = useState(() => normalizePath(initialPath));

  useEffect(() => {
    // Old links used hash routes (/#/download). Move them to real paths.
    const legacy = window.location.hash.match(/^#\/(download|terms|privacy)/);
    if (legacy) {
      window.history.replaceState(null, '', `/${legacy[1]}`);
      setPath(`/${legacy[1]}`);
    }
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const [pathname, hash] = to.split('#');
    const target = normalizePath(pathname || '/');
    if (target !== normalizePath(window.location.pathname)) {
      window.history.pushState(null, '', to);
      setPath(target);
      if (!hash) window.scrollTo({ top: 0 });
    } else if (!hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (hash) {
      window.history.replaceState(null, '', to);
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
    }
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext);

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Internal link: a real <a href> for crawlers, client-side navigation for people. */
export function Link({ href, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const external = /^(https?:|mailto:|tel:)/.test(href);
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} {...rest} />;
  }
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
