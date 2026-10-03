import { renderToString } from 'react-dom/server';
import App from './App';

export { PAGES, SITE, headTags } from './seo';
export { jsonLd } from './jsonld';

/** Renders one page to HTML. The prerender script calls this once per route at build time. */
export function render(path: string) {
  return renderToString(<App initialPath={path} />);
}
