import { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Home from './pages/Home';
import Download from './pages/Download';
import Legal from './pages/Legal';

const TITLES = {
  home: 'Nomadic: the whole job search, on your desktop',
  download: 'Download Nomadic: coming soon',
  terms: 'Terms and Conditions | Nomadic',
  privacy: 'Privacy Policy | Nomadic',
};

function pageFor(route: string) {
  if (route.startsWith('#/download')) return 'download';
  if (route.startsWith('#/terms')) return 'terms';
  if (route.startsWith('#/privacy')) return 'privacy';
  return 'home';
}

function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const page = pageFor(route);

  // Section ids such as #learn also change the hash. Only real page changes reset the scroll.
  useEffect(() => {
    document.title = TITLES[page];
    window.scrollTo(0, 0);
  }, [page]);

  return (
    <>
      {page === 'download' && <Download />}
      {page === 'terms' && <Legal type="terms" />}
      {page === 'privacy' && <Legal type="privacy" />}
      {page === 'home' && <Home />}
      <Analytics />
    </>
  );
}

export default App;
