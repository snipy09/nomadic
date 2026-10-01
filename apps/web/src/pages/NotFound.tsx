import React from 'react';
import { Link } from '../lib/router';

export default function NotFound() {
  return (
    <section className="container-page flex min-h-[70vh] flex-col items-center justify-center pt-24 text-center">
      <p className="t-eyebrow fade-up text-accent">404</p>
      <h1 className="t-display fade-up mt-3" style={{ ['--d' as string]: '100ms' }}>
        This page took a different path.
      </h1>
      <p className="t-lead fade-up mt-5" style={{ ['--d' as string]: '200ms' }}>
        The page you are looking for does not exist or has moved.
      </p>
      <Link href="/" className="btn-primary fade-up mt-8" style={{ ['--d' as string]: '300ms' }}>
        Back to home
      </Link>
    </section>
  );
}
