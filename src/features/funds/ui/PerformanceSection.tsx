'use client';

import { useMemo } from 'react';
import { performanceMetrics, type NavPoint, type PeriodReturn } from '@/contracts';
import { DataTable } from '@/components/ui/DataTable';
import { KpiCard, KpiGrid } from '@/components/ui/Kpi';
import { Notice } from '@/components/ui/primitives';
import { formatPct } from '@/lib/format/inr';

/** Historical performance from observed NAVs only. All numbers come from the contract engine. */
export function PerformanceSection({ navs }: { navs: NavPoint[] }) {
  const r = useMemo(() => performanceMetrics(navs), [navs]);
  if (!r.ok) {
    return (
      <Notice tone="info" title="Performance not available">
        {r.error.message}
      </Notice>
    );
  }
  const v = r.value;
  return (
    <section aria-labelledby="perf-heading" className="space-y-3">
      <h2 id="perf-heading" className="text-xl font-semibold">
        Historical performance (observed NAV)
      </h2>
      <p className="text-sm text-muted">
        As of the latest NAV, {v.asOf}. Past performance does not indicate future results. NAVs are after the scheme’s expenses, so no expense ratio is deducted again.
      </p>
      <DataTable<PeriodReturn>
        caption="Point-to-point returns by period"
        rows={v.periods}
        rowKey={(p) => p.key}
        columns={[
          { header: 'Period', cell: (p) => p.label },
          { header: 'Return', numeric: true, cell: (p) => (p.status === 'available' ? formatPct(p.valuePct, 2) : 'Insufficient history') },
          { header: 'Type', cell: (p) => (p.kind === 'annualised' ? 'Annualised (CAGR)' : 'Absolute') },
          { header: 'From – to', cell: (p) => (p.startDate ? `${p.startDate} – ${p.endDate}` : '—') },
        ]}
      />
      <KpiGrid>
        <KpiCard
          label="Annualised volatility"
          value={v.volatility.status === 'available' ? formatPct(v.volatility.annualisedPct, 2) : 'Insufficient history'}
          sub={`${v.volatility.observations} daily log returns`}
        />
        <KpiCard
          label="Maximum drawdown"
          value={v.maxDrawdown ? formatPct(v.maxDrawdown.pct, 2) : 'Not available'}
          sub={v.maxDrawdown ? `${v.maxDrawdown.peakDate} → ${v.maxDrawdown.troughDate}${v.maxDrawdown.recoveryDate ? `, recovered ${v.maxDrawdown.recoveryDate}` : ', not yet recovered'}` : undefined}
        />
        <KpiCard label="Best calendar year" value={v.bestYear ? `${formatPct(v.bestYear.returnPct, 2)} (${v.bestYear.year})` : 'Insufficient history'} />
        <KpiCard label="Worst calendar year" value={v.worstYear ? `${formatPct(v.worstYear.returnPct, 2)} (${v.worstYear.year})` : 'Insufficient history'} />
      </KpiGrid>
      <p className="text-xs text-muted">
        Method: periods under a year are absolute returns; periods of a year or more are annualised on ACT/365. Each window starts at the last NAV on or before its start date (within 7 days) and never before the first NAV in this dataset. Volatility is the sample standard deviation of daily log returns × √252 and needs at least 60 returns. Drawdown is measured on the NAV itself. Calendar years are shown only when complete.
      </p>
    </section>
  );
}
