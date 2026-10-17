/** Lakshya mark: a target ring with an upward path. Decorative; the link carries the accessible name. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--brand)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="var(--brand)" strokeWidth="2" opacity="0.55" />
      <path d="M7 22 L13 16 L17 19 L25 10" fill="none" stroke="var(--brand)" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="10" r="2.25" fill="var(--brand)" />
    </svg>
  );
}
