import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { UIProvider } from '../src';
import { App } from './App';
import './showcase.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UIProvider>
      <App />
    </UIProvider>
  </StrictMode>,
);
