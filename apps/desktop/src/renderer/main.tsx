import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { UIProvider } from '@nomadic/ui';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <UIProvider>
        <App />
      </UIProvider>
    </ErrorBoundary>
  );
}

