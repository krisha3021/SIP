'use client';

import { useMemo, useState } from 'react';
import { checkBacktestEligibility, stressTestRange, type AssetRange, type StressSeriesInput } from '@/contracts';
import { NumberField } from '@/components/ui/NumberField';
import { Badge, Button, Notice } from '@/components/ui/primitives';
import { Money } from '@/components/ui/Kpi';
import { Warnings } from '@/components/calculator/CalculatorLayout';
import { formatINR, formatPct } from '@/lib/format/inr';
import { useFields } from '@/features/calculators/ui/useFields';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { useNav, type NavState } from '@/features/funds/ui/FundDetail';
import { ProvenancePanel } from '@/features/funds/ui/ProvenancePanel';
import type { NavResponse } from '@/features/funds/ui/api';

type Asset = 'equity' | 'debt' | 'gold';
const ASSET_LABEL: Record<Asset, string> = { equity: 'Equity', debt: 'Debt', gold: 'Gold' };
const AMOUNT_DEFAULTS = { amt: '' } as const satisfies Record<string, ''>;

/** A slot is usable when its scheme loaded and passes the engine's plan/option eligibility rule. */
function usable(code: string | null, state: NavState): NavResponse | null {
  if (!code || state.status !== 'ready') return null;
  return checkBacktestEligibility(state.data.meta).ok ? state.data : null;
}

/**
 * "Observed historical fall": the largest peak-to-trough fall in a user-chosen equity scheme's real NAV
 * history, applied to both ends of today's equity range. Optional debt and gold schemes are measured over
 * the same dates by the engine; without them those assets are assumed unchanged.
 */
export function StressTest({ range }: { range: AssetRange }) {
  const [codes, setCodes] = useState<Record<Asset, string | null>>({ equity: null, debt: null, gold: null });
  const equity = useNav(codes.equity);
  const debt = useNav(codes.debt);
  const gold = useNav(codes.gold);
  const states: Record<Asset, NavState> = { equity, debt, gold };
  const f = useFields(AMOUNT_DEFAULTS);

  const eq = usable(codes.equity, equity);
  const db = usable(codes.debt, debt);
  const gd = usable(codes.gold, gold);
  const result = useMemo(() => {
    if (!eq) return null;
    const series: StressSeriesInput = {
      equity: { label: eq.meta.schemeName, points: eq.navs },
      ...(db ? { debt: { label: db.meta.schemeName, points: db.navs } } : {}),
      ...(gd ? { gold: { label: gd.meta.schemeName, points: gd.navs } } : {}),
    };
    const amount = f.values.amt ?? undefined;
    return stressTestRange(range, series, amount !== undefined ? { amount } : {});
  }, [eq, db, gd, range, f.values.amt]);

  const setCode = (a: Asset, c: string | null) => setCodes((prev) => ({ ...prev, [a]: c }));

  return (
    <section aria-labelledby="stress-heading" className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <h3 id="stress-heading" className="text-lg font-semibold">
        Observed historical fall
      </h3>
      <p className="text-sm text-muted">
        Pick an equity scheme. Lakshya finds the largest peak-to-trough fall in its published NAV history and shows what that one past fall would have done to the
        lower and upper ends of your equity range. Optionally pick a debt scheme and a gold scheme: they are measured over the same dates. A past fall is not a
        forecast.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        {(['equity', 'debt', 'gold'] as const).map((a) => (
          <SchemeSlot key={a} asset={a} code={codes[a]} state={states[a]} range={range} onPick={(c) => setCode(a, c)} />
        ))}
      </div>

      {eq && (
        <div className="space-y-3" data-testid="stress-result">
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
                  Largest observed fall in {result.value.equityLabel}: <strong className="num">{formatPct(result.value.assetChangesPct.equity, 1)}</strong> from {result.value.peakDate} to{' '}
                  {result.value.troughDate}
                  {result.value.recoveryDate ? `, regained by ${result.value.recoveryDate}` : ', not regained by the end of the data'}.
                </span>
              </div>
              <ul className="text-sm" data-testid="stress-asset-changes">
                {(['debt', 'gold'] as const).map((a) => (
                  <li key={a}>
                    {ASSET_LABEL[a]} over the same dates:{' '}
                    {result.value.assetChangesPct[a] === null ? <span>assumed unchanged (0%), no usable series</span> : <strong className="num">{formatPct(result.value.assetChangesPct[a], 1)}</strong>}
                  </li>
                ))}
              </ul>
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
                <p className="text-sm text-muted">Assumed unchanged (0%) because no usable series was supplied: {result.value.assumedUnchanged.join(', ')}.</p>
              )}
              <p className="text-xs text-muted">
                Based on {result.value.observations.toLocaleString('en-IN')} equity observations. Amount illustrated: {f.values.amt !== null ? formatINR(f.values.amt, 0) : 'none'}.
              </p>
              <Warnings warnings={result.warnings} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SchemeSlot({ asset, code, state, range, onPick }: { asset: Asset; code: string | null; state: NavState; range: AssetRange; onPick: (c: string | null) => void }) {
  const label = ASSET_LABEL[asset];
  const optional = asset !== 'equity';
  return (
    <div className="space-y-3 rounded-lg border border-line p-3" data-testid={`stress-slot-${asset}`}>
      <p className="font-semibold">
        {label} scheme {optional && <span className="font-normal text-muted">(optional)</span>}
      </p>
      {!code ? (
        <>
          {optional && <p className="text-xs text-muted">If none is picked, {label.toLowerCase()} is assumed unchanged (0%) during the fall.</p>}
          <FundSearch onPick={(r) => onPick(String(r.schemeCode))} label={`Find a${asset === 'equity' ? 'n' : ''} ${label.toLowerCase()} scheme for the stress test`} />
        </>
      ) : state.status === 'loading' ? (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          Loading NAV history for scheme {code}…
        </p>
      ) : state.status === 'error' ? (
        <>
          <div role="alert">
            <Notice tone="danger" title="NAV data could not be loaded">
              {state.error.message}
            </Notice>
          </div>
          <Button onClick={() => onPick(null)}>Choose another scheme</Button>
        </>
      ) : (
        <SlotDetail asset={asset} data={state.data} range={range} onClear={() => onPick(null)} />
      )}
    </div>
  );
}

/** Shows the picked series' own observed peak, trough and recovery (from the engine run on that series alone). */
function SlotDetail({ asset, data, range, onClear }: { asset: Asset; data: NavResponse; range: AssetRange; onClear: () => void }) {
  const elig = checkBacktestEligibility(data.meta);
  const own = useMemo(() => (elig.ok ? stressTestRange(range, { equity: { label: data.meta.schemeName, points: data.navs } }) : null), [elig.ok, range, data]);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{data.meta.schemeName}</p>
      <Button onClick={onClear}>Choose another scheme</Button>
      {!elig.ok ? (
        <div role="alert">
          <Notice tone="warning" title="This scheme cannot be used for the stress test">
            {elig.error.message}
          </Notice>
        </div>
      ) : own?.ok ? (
        <p className="text-sm" data-testid={`stress-own-${asset}`}>
          This series&apos; own largest observed fall: <strong className="num">{formatPct(own.value.assetChangesPct.equity, 1)}</strong>, peak {own.value.peakDate}, trough {own.value.troughDate},{' '}
          {own.value.recoveryDate ? `recovered ${own.value.recoveryDate}` : 'not recovered by the end of the data'}.
        </p>
      ) : own && !own.ok ? (
        <p className="text-sm text-muted">{own.error.message}</p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm">Data source for this series</summary>
        <div className="mt-2">
          <ProvenancePanel provenance={data.provenance} freshness={data.freshness} servedFrom={data.servedFrom} lastError={data.lastError} droppedRows={data.droppedRows} />
        </div>
      </details>
    </div>
  );
}
