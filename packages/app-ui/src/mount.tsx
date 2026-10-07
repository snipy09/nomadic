import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { UIProvider } from '@nomadic/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startRendererCrashReporting } from './features/help/crashReporting';

/**
 * Renders the Nomadic app into `container`. Each app (apps/desktop, apps/mac, apps/android) calls this from its own
 * renderer entry after its platform setup; which platform it is comes from VITE_PLATFORM (see platform.ts).
 */
export function mountApp(container: HTMLElement | null = document.getElementById('root')): void {
  void startRendererCrashReporting();
  if (!container) return;
  createRoot(container).render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <UIProvider>
          <App />
        </UIProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
