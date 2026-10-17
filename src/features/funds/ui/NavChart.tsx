'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatIndianNumber, formatPct } from '@/lib/format/inr';

const tick = { fill: 'var(--text-muted)', fontSize: 12 };

/** Observed NAV per unit over time. Points are drawn as published; nothing is interpolated. */
export function NavChart({ data, summary }: { data: Array<{ date: string; nav: number }>; summary: React.ReactNode }) {
  return (
    <figure className="space-y-2">
      <div style={{ height: 300 }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={tick} minTickGap={48} stroke="var(--border-strong)" tickFormatter={(d: string) => d.slice(0, 7)} />
            <YAxis tick={tick} width={64} stroke="var(--border-strong)" tickFormatter={(v: number) => formatIndianNumber(v, 0)} domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v) => [`₹${formatIndianNumber(Number(v), 4)}`, 'NAV']}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
            />
            <Line dataKey="nav" name="NAV" stroke="var(--chart-1)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted">
        <span className="font-semibold text-text">NAV per unit (₹), as published. </span>
        {summary}
      </figcaption>
    </figure>
  );
}

/** Rolling CAGR windows by start date (percent values from the engine). */
export function RollingChart({ data, windowYears }: { data: Array<{ startDate: string; cagrPct: number }>; windowYears: number }) {
  return (
    <div style={{ height: 260 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey="startDate" tick={tick} minTickGap={48} stroke="var(--border-strong)" tickFormatter={(d: string) => d.slice(0, 7)} />
          <YAxis tick={tick} width={56} stroke="var(--border-strong)" tickFormatter={(v: number) => formatPct(v, 0)} />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip
            formatter={(v) => [formatPct(Number(v), 2), `${windowYears}-year CAGR`]}
            labelFormatter={(l) => `Start ${l}`}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
          />
          <Line dataKey="cagrPct" name={`${windowYears}-year CAGR`} stroke="var(--chart-3)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
