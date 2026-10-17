import { Info } from 'lucide-react';

/** Renders an engine-supplied notice verbatim. Shown beside every result, and printed. */
export function MandatoryNotice({ text, title = 'Educational illustration' }: { text: string; title?: string }) {
  return (
    <aside aria-label={title} data-testid="mandatory-notice" className="flex gap-3 rounded-lg border border-info/40 bg-info-soft p-3 text-sm text-info">
      <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        <p>{text}</p>
      </div>
    </aside>
  );
}
