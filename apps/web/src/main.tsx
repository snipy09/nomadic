import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';

const root = document.getElementById('root')!;
const app = (
  <React.StrictMode>
    <App url={window.location.pathname}>
      <Analytics />
    </App>
  </React.StrictMode>
);

if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
