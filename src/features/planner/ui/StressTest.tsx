'use client';

import { useMemo, useState } from 'react';
import { checkBacktestEligibility, stressTestRange, type AssetRange } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Badge, Button, Notice } from '@/components/ui/primitives';
import { Money } from '@/components/ui/Kpi';
import { Warnings } from '@/components/calculator/CalculatorLayout';
import { formatINR, formatPct } from '@/lib/format/inr';
import { useFields } from '@/features/calculators/ui/useFields';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { useNav } from '@/features/funds/ui/FundDetail';
import { ProvenancePanel } from '@/features/funds/ui/ProvenancePanel';
import type { NavResponse } from '@/features/funds/ui/api';

const AMOUNT_DEFAULTS = { amt: '' } as const satisfies Record<string, ''>;

/**
 * "Observed historical fall": applies the largest peak-to-trough fall in a scheme's real NAV history
 * (chosen by the user, fetched through /api/funds) to both ends of today's equity range.
 */
export function StressTest({ range }: { range: AssetRange }) {
  const [scheme, setScheme] = useState<string | null>(null);
  return (
    <section aria-labelledby="stress-heading" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h3 id="stress-heading" className="text-lg font-semibold">
        Observed historical fall
      </h3>
      <p className="text-sm text-muted">
        Pick an equity scheme. Lakshya finds the largest peak-to-trough fall in its published NAV history and shows what that one past fall would have done to the
        lower and upper ends of your equity range. Debt and gold are assumed unchanged unless stated. A past fall is not a forecast.
      </p>
      {!scheme ? (
        <FundSearch onPick={(r) => setScheme(String(r.schemeCode))} label="Find an equity scheme for the stress test" />
      ) : (
        <StressForScheme key={scheme} code={scheme} range={range} onChange={() => setScheme(null)} />
      )}
    </section>
  );
}

function StressForScheme({ code, range, onChange }: { code: string; range: AssetRange; onChange: () => void }) {
  const state = useNav(code);
  if (state.status === 'loading')
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted">
        Loading NAV history for scheme {code}…
      </p>
    );
  if (state.status === 'error')
    return (
      <div className="space-y-2">
        <div role="alert">
          <Notice tone="danger" title="NAV data could not be loaded">
            {state.error.message}
          </Notice>
        </div>
        <Button onClick={onChange}>Choose another scheme</Button>
      </div>
    );
  return <StressResult data={state.data} range={range} onChange={onChange} />;
}

function StressResult({ data, range, onChange }: { data: NavResponse; range: AssetRange; onChange: () => void }) {
  const f = useFields(AMOUNT_DEFAULTS);
  // IDCW NAVs drop at each payout, which would look like a market fall; the engine's eligibility rule refuses them.
  const elig = checkBacktestEligibility(data.meta);
  const result = useMemo(() => {
    if (!elig.ok) return null;
    const amount = f.values.amt ?? undefined;
    return stressTestRange(range, { equity: { label: data.meta.schemeName, points: data.navs } }, amount !== undefined ? { amount } : {});
  }, [elig.ok, range, data, f.values.amt]);

  return (
    <div className="space-y-4" data-testid="stress-result">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{data.meta.schemeName}</p>
        <Button onClick={onChange}>Choose another scheme</Button>
      </div>
      {!elig.ok ? (
        <div role="alert">
          <Notice tone="warning" title="This scheme cannot be used for the stress test">
            {elig.error.message}
          </Notice>
        </div>
      ) : (
        <>
          <div className="max-w-xs">
            <NumberField
              name="amt"
              label="Amount to illustrate (optional)"
              value={f.raw.amt}
              onChange={(x) => f.set('amt', x)}
              sliderMin={0}
              sliderMax={10_000_000}
              noSlider
              prefix="₹"
              error={f.parseErrors.amt}
              hint="Not saved or shared."
            />
          </div>
          {result && !result.ok && (
            <div role="alert">
              <Notice tone="danger" title="No stress result">
                {result.error.message}
              </Notice>
            </div>
          )}
          {result?.ok && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">Historical data</Badge>
                <span className="text-sm">
                  Largest observed fall: <strong className="num">{formatPct(result.value.assetChangesPct.equity, 1)}</strong> from {result.value.peakDate} to{' '}
                  {result.value.troughDate}
                  {result.value.recoveryDate ? `, regained by ${result.value.recoveryDate}` : ', not regained by the end of the data'}.
                </span>
              </div>
              <div role="region" aria-label="Stress test mixes" tabIndex={0} className="overflow-x-auto rounded-lg border border-line">
                <table className="num w-full text-sm">
                  <caption className="sr-only">Effect of the observed fall on the lower and upper ends of the equity range</caption>
                  <thead className="bg-surface-2">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Mix</th>
                      <th scope="col" className="px-3 py-2 text-right">Equity / debt / gold</th>
                      <th scope="col" className="px-3 py-2 text-right">Change</th>
                      {f.values.amt !== null && <th scope="col" className="px-3 py-2 text-right">In rupees</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.value.mixes.map((m) => (
                      <tr key={m.name} className="border-t border-line">
                        <th scope="row" className="px-3 py-1.5 text-left font-medium">
                          {m.name === 'lower-equity' ? 'Lower end of equity range' : 'Upper end of equity range'}
                        </th>
                        <td className="px-3 py-1.5 text-right">
                          {formatPct(m.weightsPct.equity, 1)} / {formatPct(m.weightsPct.debt, 1)} / {formatPct(m.weightsPct.gold, 1)}
                        </td>
                        <td className="px-3 py-1.5 text-right">{formatPct(m.portfolioChangePct, 1)}</td>
                        {f.values.amt !== null && <td className="px-3 py-1.5 text-right">{m.rupeeChange === null ? '—' : <Money value={m.rupeeChange} />}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.value.assumedUnchanged.length > 0 && (
                <p className="text-sm text-muted">Assumed unchanged (0%) because no series was supplied: {result.value.assumedUnchanged.join(', ')}.</p>
              )}
              <p className="text-xs text-muted">
                Based on {result.value.observations.toLocaleString('en-IN')} observations. Amount illustrated: {f.values.amt !== null ? formatINR(f.values.amt, 0) : 'none'}.
              </p>
              <Warnings warnings={result.warnings} />
            </>
          )}
        </>
      )}
      <ProvenancePanel provenance={data.provenance} freshness={data.freshness} servedFrom={data.servedFrom} lastError={data.lastError} droppedRows={data.droppedRows} />
    </div>
  );
}
