import { QueryClient } from '@tanstack/react-query';

/** The renderer's one TanStack Query client (provided in main.tsx). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true, retry: 1 },
  },
});
