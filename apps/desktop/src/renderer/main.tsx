import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { UIProvider } from '@nomadic/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UIProvider>
          <App />
        </UIProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

