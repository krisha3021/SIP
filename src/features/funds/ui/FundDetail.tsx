'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { rollingReturnsForScheme } from '@/contracts';
import { Choice } from '@/components/ui/Choice';
import { KpiCard, KpiGrid } from '@/components/ui/Kpi';
import { Notice, buttonClass } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { formatIndianNumber, formatPct } from '@/lib/format/inr';
import { formatCount, formatShare } from '@/features/calculators/ui/format';
import { fetchNav, toHistory, type ApiFailure, type NavResponse } from './api';
import { ProvenancePanel } from './ProvenancePanel';
import { NavChart, RollingChart } from './NavChart';

export type NavState = { status: 'loading' } | { status: 'error'; error: ApiFailure['error'] } | { status: 'ready'; data: NavResponse };

export function useNav(code: string | number | null): NavState {
  // The settled result is stored with the code it belongs to; a different code means "loading".
  const [settled, setSettled] = useState<{ code: string; state: NavState } | null>(null);
  useEffect(() => {
    if (code === null) return;
    const c = new AbortController();
    fetchNav(code, c.signal)
      .then((r) => setSettled({ code: String(code), state: r.ok ? { status: 'ready', data: r } : { status: 'error', error: r.error } }))
      .catch(() => {
        /* aborted */
      });
    return () => c.abort();
  }, [code]);
  return settled && settled.code === String(code) ? settled.state : { status: 'loading' };
}

const NOT_AVAILABLE_FIELDS = ['Assets under management (AUM)', 'Expense ratio (TER)', 'Portfolio holdings', 'Third-party ratings', 'Fund manager'];

export function FundDetail({ schemeCode }: { schemeCode: string }) {
  const state = useNav(schemeCode);

  if (state.status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="text-muted">
        Loading NAV history for scheme {schemeCode}…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div role="alert">
        <Notice tone="danger" title="NAV data could not be loaded">
          <p>{state.error.message}</p>
          <p className="mt-1">
            <Link href="/funds">Back to search</Link>
          </p>
        </Notice>
      </div>
    );
  }
  const d = state.data;
  const latest = d.navs[d.navs.length - 1];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{d.meta.schemeName}</h2>
        <p className="mt-1 text-sm text-muted">
          {d.meta.fundHouse ?? 'Fund house not available'} · {d.meta.category ?? 'Category not available'}
        </p>
      </div>
      <KpiGrid>
        <KpiCard label={`NAV on ${latest?.date ?? '—'}`} value={latest ? `₹${formatIndianNumber(latest.nav, 4)}` : 'Not available'} emphasis sub="Latest observation from the provider" />
        <KpiCard label="Plan / option" value={`${d.meta.plan === 'Unknown' ? 'Not stated' : d.meta.plan} / ${d.meta.option === 'Unknown' ? 'Not stated' : d.meta.option}`} />
        <KpiCard label="ISIN (growth)" value={d.meta.isinGrowth ?? 'Not available'} />
        <KpiCard label="Observations" value={formatCount(d.navs.length)} sub={d.provenance.coverage ? `${d.provenance.coverage.from} to ${d.provenance.coverage.to}` : undefined} />
      </KpiGrid>
      <ProvenancePanel provenance={d.provenance} freshness={d.freshness} servedFrom={d.servedFrom} lastError={d.lastError} droppedRows={d.droppedRows} timestamps={d.timestamps} />
      <section aria-labelledby="nav-heading" className="space-y-3">
        <h2 id="nav-heading" className="text-xl font-semibold">
          NAV history
        </h2>
        <Tabs
          label="NAV views"
          tabs={[
            {
              id: 'chart',
              label: 'Chart',
              content: (
                <NavChart
                  data={d.navs}
                  summary={
                    <>
                      {formatCount(d.navs.length)} observations from {d.provenance.coverage?.from} to {d.provenance.coverage?.to}. The latest NAV is ₹{latest ? formatIndianNumber(latest.nav, 4) : '—'}.
                    </>
                  }
                />
              ),
            },
            {
              id: 'table',
              label: 'Recent NAVs',
              content: (
                <DataTable
                  caption="Most recent 60 NAV observations (download the full series from the Historical Analysis page)"
                  rows={d.navs.slice(-60).reverse()}
                  rowKey={(r) => r.date}
                  columns={[
                    { header: 'Date', cell: (r) => r.date },
                    { header: 'NAV (₹)', numeric: true, cell: (r) => formatIndianNumber(r.nav, 4) },
                  ]}
                />
              ),
            },
          ]}
        />
      </section>
      <RollingSection data={d} />
      <section aria-labelledby="na-heading" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="na-heading" className="font-sans text-base font-semibold">
          Not available from our data source
        </h2>
        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[16rem_1fr]">
          {NOT_AVAILABLE_FIELDS.map((f) => (
            <div key={f} className="contents">
              <dt className="text-muted">{f}</dt>
              <dd>Not available</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">We show only what the configured provider publishes. Check the scheme information document and factsheet on the AMC’s website.</p>
      </section>
      <Link href={`/historical?scheme=${d.meta.schemeCode}`} className={buttonClass('primary')}>
        Backtest a SIP in this scheme
      </Link>
    </div>
  );
}

function RollingSection({ data }: { data: NavResponse }) {
  const [w, setW] = useState<'1' | '3' | '5' | '10'>('3');
  const history = useMemo(() => toHistory(data), [data]);
  const result = useMemo(() => rollingReturnsForScheme(history, Number(w)), [history, w]);
  return (
    <section aria-labelledby="rolling-heading" className="space-y-3">
      <h2 id="rolling-heading" className="text-xl font-semibold">
        Rolling returns
      </h2>
      <p className="text-sm text-muted">Point-to-point CAGR for every monthly start date, using observed NAVs only. Historical data; past performance does not indicate future results.</p>
      <div className="max-w-md">
        <Choice
          legend="Window length"
          value={w}
          onChange={setW}
          options={[
            { value: '1', label: '1 year' },
            { value: '3', label: '3 years' },
            { value: '5', label: '5 years' },
            { value: '10', label: '10 years' },
          ]}
        />
      </div>
      {!result.ok ? (
        <Notice tone={result.error.code === 'UNSUPPORTED' ? 'warning' : 'info'} title={result.error.code === 'UNSUPPORTED' ? 'Rolling returns are not available for this scheme' : 'Not enough history for this window'}>
          {result.error.message}
        </Notice>
      ) : (
        <>
          <KpiGrid>
            <KpiCard label="Lowest" value={formatPct(result.value.stats.min, 2)} />
            <KpiCard label="Median" value={formatPct(result.value.stats.median, 2)} emphasis />
            <KpiCard label="Highest" value={formatPct(result.value.stats.max, 2)} />
            <KpiCard label="Windows with a positive return" value={formatShare(result.value.stats.positiveShare)} sub={`${formatCount(result.value.stats.count)} windows`} />
          </KpiGrid>
          <figure>
            <RollingChart data={result.value.windows} windowYears={result.value.windowYears} />
            <figcaption className="mt-2 text-sm text-muted">
              {result.value.windowYears}-year rolling CAGR by start date, from {formatPct(result.value.stats.min, 1)} to {formatPct(result.value.stats.max, 1)} across {formatCount(result.value.stats.count)} windows.
            </figcaption>
          </figure>
        </>
      )}
    </section>
  );
}
