'use client';

import { Button } from '@/components/ui/primitives';

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-muted">This part of the page failed to load. Your saved plans are not affected.</p>
      <Button variant="primary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
