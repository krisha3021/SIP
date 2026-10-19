'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  MAX_COMPARE,
  RESEARCH_FIELD_LABELS,
  comparabilityWarnings,
  holdingsOverlap,
  performanceMetrics,
  type CompareRow,
  type PeriodKey,
  type ResearchFieldKey,
} from '@/contracts';
import { Button, Notice } from '@/components/ui/primitives';
import { formatIndianNumber, formatPct } from '@/lib/format/inr';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { fetchNav, fetchProfile, type NavResponse, type ProfileResponse } from '@/features/funds/ui/api';
import { formatFieldValue } from '@/features/funds/ui/FieldRow';

type Loaded = { code: number; status: 'loading' } | { code: number; status: 'error'; message: string } | { code: number; status: 'ready'; nav: NavResponse; profile: ProfileResponse | null };

const FIELD_ROWS: ResearchFieldKey[] = ['ter', 'aaum', 'benchmark', 'fundManagers', 'exitLoad', 'holdings', 'sectorAllocation'];
const RETURN_ROWS: PeriodKey[] = ['1Y', '3Y', '5Y'];

function syncUrl(codes: number[]) {
  try {
    const url = new URL(window.location.href);
    if (codes.length) url.searchParams.set('codes', codes.join(','));
    else url.searchParams.delete('codes');
    window.history.replaceState(null, '', url);
  } catch {
    /* non-browser */
  }
}

export function CompareFunds({ initialCodes = [] }: { initialCodes?: number[] }) {
  const [codes, setCodes] = useState<number[]>(initialCodes.slice(0, MAX_COMPARE));
  const [loaded, setLoaded] = useState<Record<number, Loaded>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const c = new AbortController();
    for (const code of codes) {
      if (loaded[code]) continue;
      Promise.all([fetchNav(code, c.signal), fetchProfile(code, c.signal)])
        .then(([nav, profile]) =>
          setLoaded((prev) => ({
            ...prev,
            [code]: nav.ok ? { code, status: 'ready', nav, profile: profile.ok ? profile : null } : { code, status: 'error', message: nav.error.message },
          })),
        )
        .catch(() => {
          /* aborted */
        });
    }
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch only codes not yet loaded
  }, [codes]);

  const add = (code: number) => {
    if (codes.includes(code)) return setMessage('That scheme is already in the comparison.');
    if (codes.length >= MAX_COMPARE) return setMessage(`You can compare at most ${MAX_COMPARE} funds at a time. Remove one first.`);
    const next = [...codes, code];
    setMessage(null);
    setCodes(next);
    syncUrl(next);
  };
  const remove = (code: number) => {
    const next = codes.filter((c) => c !== code);
    setCodes(next);
    setMessage(null);
    syncUrl(next);
  };

  const ready = codes.map((c) => loaded[c]).filter((l): l is Extract<Loaded, { status: 'ready' }> => l?.status === 'ready');
  const perf = useMemo(() => Object.fromEntries(ready.map((r) => [r.code, performanceMetrics(r.nav.navs)])), [ready]);

  const rows: CompareRow[] = ready.map((r) => {
    const p = perf[r.code];
    const fields = r.profile?.fields;
    return {
      schemeId: r.code,
      name: r.nav.meta.schemeName,
      subcategory: r.profile?.identity.subcategory ?? null,
      planType: r.nav.meta.plan,
      optionType: r.nav.meta.option,
      navDate: r.nav.timestamps.dataAsOf,
      availablePeriods: p?.ok ? p.value.periods.filter((x) => x.status === 'available').map((x) => x.key) : [],
      unavailableResearchFields: fields ? Object.values(fields).filter((f) => f.value === null).length : Object.keys(RESEARCH_FIELD_LABELS).length,
    };
  });
  const warnings = rows.length >= 2 ? comparabilityWarnings(rows) : null;
  const overlap = holdingsOverlap(null, null);

  const cell = (r: Extract<Loaded, { status: 'ready' }>, key: string): React.ReactNode => {
    const p = perf[r.code];
    switch (key) {
      case 'Category':
        return r.profile?.identity.subcategory ?? 'Not available';
      case 'AMC':
        return r.nav.meta.fundHouse ?? 'Not available';
      case 'Plan / option':
        return `${r.nav.meta.plan} / ${r.nav.meta.option}`;
      case 'NAV date':
        return r.nav.timestamps.dataAsOf ?? 'Not available';
      case 'Latest NAV': {
        const last = r.nav.navs[r.nav.navs.length - 1];
        return last ? `₹${formatIndianNumber(last.nav, 4)}` : 'Not available';
      }
      case 'Volatility (annualised)':
        return p?.ok && p.value.volatility.annualisedPct !== null ? formatPct(p.value.volatility.annualisedPct, 2) : 'Insufficient history';
      case 'Maximum drawdown':
        return p?.ok && p.value.maxDrawdown ? formatPct(p.value.maxDrawdown.pct, 2) : 'Not available';
      case 'Third-party rating':
        return 'Rating unavailable';
      default: {
        const period = RETURN_ROWS.find((k) => key === `${k} return`);
        if (period) {
          const x = p?.ok ? p.value.periods.find((q) => q.key === period) : undefined;
          return x && x.status === 'available' ? `${formatPct(x.valuePct, 2)} ${x.kind === 'annualised' ? 'p.a.' : ''}` : 'Insufficient history';
        }
        const fieldKey = FIELD_ROWS.find((k) => RESEARCH_FIELD_LABELS[k] === key);
        if (fieldKey) {
          const f = r.profile?.fields[fieldKey];
          if (!f) return 'Not available';
          return (
            <>
              {formatFieldValue(f)}
              {f.value !== null && f.observation_date ? <span className="block text-xs text-muted">as of {f.observation_date}</span> : null}
            </>
          );
        }
        return '—';
      }
    }
  };

  const ROW_LABELS = ['AMC', 'Category', 'Plan / option', 'NAV date', 'Latest NAV', ...RETURN_ROWS.map((k) => `${k} return`), 'Volatility (annualised)', 'Maximum drawdown', ...FIELD_ROWS.map((k) => RESEARCH_FIELD_LABELS[k]), 'Third-party rating'];

  return (
    <div className="space-y-6">
      <FundSearch label="Add a scheme to compare" onPick={(r) => add(r.schemeCode)} />
      <div role="status" aria-live="polite">
        {message && <Notice tone="warning" title="Not added">{message}</Notice>}
      </div>
      {codes.length === 0 && <p className="text-muted">Search for up to {MAX_COMPARE} schemes to compare them on the same rows.</p>}
      {codes.some((c) => loaded[c]?.status === 'loading' || !loaded[c]) && <p className="text-sm text-muted">Loading fund data…</p>}
      {codes.map((c) => {
        const l = loaded[c];
        return l?.status === 'error' ? (
          <Notice key={c} tone="danger" title={`Scheme ${c} could not be loaded`}>
            {l.message}
          </Notice>
        ) : null;
      })}
      {ready.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table aria-label="Fund comparison" className="min-w-full text-sm">
            <caption className="sr-only">Fund comparison: one column per fund, the same rows for every fund</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  Field
                </th>
                {ready.map((r) => (
                  <th key={r.code} scope="col" className="min-w-[12rem] px-3 py-2 text-left align-top">
                    <Link href={`/funds/${r.code}`}>{r.nav.meta.schemeName}</Link>
                    <Button variant="ghost" className="ml-1 align-middle" onClick={() => remove(r.code)} aria-label={`Remove ${r.nav.meta.schemeName} from the comparison`}>
                      <X size={14} aria-hidden="true" />
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_LABELS.map((label) => (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted">
                    {label}
                  </th>
                  {ready.map((r) => (
                    <td key={r.code} className="num px-3 py-2 align-top">
                      {cell(r, label)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {warnings?.ok && warnings.value.length > 0 && (
        <Notice tone="warning" title="Read before comparing">
          <ul className="list-disc space-y-1 pl-5">
            {warnings.value.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
        </Notice>
      )}
      {ready.length >= 2 && (
        <section aria-labelledby="overlap-heading" className="rounded-xl border border-line bg-surface p-4 text-sm">
          <h2 id="overlap-heading" className="font-sans text-base font-semibold">
            Portfolio overlap
          </h2>
          <p className="mt-1">Unavailable — {overlap.note.charAt(0).toLowerCase() + overlap.note.slice(1)}</p>
          <p className="mt-1 text-xs text-muted">Method when data exists: {overlap.formula} Partial disclosures such as top-10 holdings are flagged, because they are not a complete portfolio.</p>
        </section>
      )}
      <p className="text-xs text-muted">Returns are from observed NAVs and do not indicate future results. Rows show “Not available” when no authorised source supplies the value.</p>
    </div>
  );
}
