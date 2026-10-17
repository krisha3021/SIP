import { ButtonLink } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted">The page you asked for does not exist or has moved.</p>
      <div className="mt-6 flex justify-center gap-3">
        <ButtonLink href="/" variant="primary">
          Home
        </ButtonLink>
        <ButtonLink href="/calculators">Calculators</ButtonLink>
      </div>
    </div>
  );
}
