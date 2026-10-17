export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold" style={{ color: 'var(--color-brand)' }}>
        Lakshya
      </h1>
      <p className="mt-4" style={{ color: 'var(--color-text-muted)' }}>
        Educational investment planning and mutual fund research for Indian investors.
      </p>
      <p className="mt-6">
        This build contains the tested calculation engines (Phase 1). The calculator interface is being built in
        Phase 2.
      </p>
      <p className="mt-10 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Created by Alok Shukla. Educational use only. Not investment advice.
      </p>
    </main>
  );
}
