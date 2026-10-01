import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import { matchRoute, renderHead, ROUTES, NOT_FOUND, absoluteUrl } from './lib/seo';

export { ROUTES, NOT_FOUND, absoluteUrl };

export function render(url: string) {
  const route = matchRoute(url);
  const html = renderToString(
    <React.StrictMode>
      <App url={url} />
    </React.StrictMode>,
  );
  return { html, head: renderHead(route) };
}
