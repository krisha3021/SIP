import type { Explanation } from '@/contracts';

/** Renders an explanation. The source is always labelled, so generated text is never mistaken for calculator output. */
export function StrategyExplanation({ explanation, providerName }: { explanation: Explanation; providerName?: string }) {
  const ai = explanation.source === 'ai';
  return (
    <section aria-labelledby={`expl-${explanation.source}`} className={`space-y-4 rounded-xl border p-4 ${ai ? 'border-info bg-info-soft' : 'border-line bg-surface'}`}>
      <div>
        <h2 id={`expl-${explanation.source}`} className="text-xl font-semibold">
          {ai ? 'AI-generated explanation' : 'What these results mean'}
        </h2>
        <p className="text-xs text-muted">
          {ai
            ? `Written by an external AI model${providerName ? ` (${providerName})` : ''} from Lakshya’s computed figures, then checked so that every number matches them. The table above remains the calculation.`
            : 'Written by Lakshya from the computed figures, without any AI service.'}
        </p>
      </div>
      {explanation.sections.map((s) => (
        <div key={s.heading}>
          <h3 className="font-sans text-base font-semibold">{s.heading}</h3>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-1 text-sm">
              {p}
            </p>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted">{explanation.notice}</p>
    </section>
  );
}
