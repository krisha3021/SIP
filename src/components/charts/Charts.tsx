'use client';

import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR, formatINRCompact } from '@/lib/format/inr';

export interface Series {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

const axisTick = { fill: 'var(--text-muted)', fontSize: 12 };

function MoneyTooltip({ active, payload, label, xLabel }: { active?: boolean; payload?: Array<{ name?: string; value?: number | number[]; color?: string }>; label?: string | number; xLabel: (v: string | number) => string }) {
  if (!active || !payload?.length || label === undefined) return null;
  return (
    <div className="rounded-md border border-line bg-surface p-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold">{xLabel(label)}</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={p.name} className="num flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span>{p.name}:</span>
            <span className="font-semibold">
              {Array.isArray(p.value) ? `${formatINR(p.value[0] ?? NaN, 0)} – ${formatINR(p.value[1] ?? NaN, 0)}` : formatINR(p.value ?? NaN, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Line chart of rupee series. Data points are engine output rows; this component only draws them.
 * Animation is off so that reduced-motion preferences are respected and screenshots are stable.
 */
export function MoneyLineChart<T extends object>({
  data,
  xKey,
  series,
  xLabel,
  title,
  summary,
  height = 300,
}: {
  data: T[];
  xKey: Extract<keyof T, string>;
  series: Series[];
  xLabel: (v: string | number) => string;
  title: string;
  /** Text alternative describing the chart's message. */
  summary: React.ReactNode;
  height?: number;
}) {
  return (
    <figure className="space-y-2">
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey={xKey as string} tick={axisTick} tickFormatter={(v) => xLabel(v)} stroke="var(--border-strong)" minTickGap={16} />
            <YAxis tick={axisTick} tickFormatter={(v: number) => formatINRCompact(v)} width={72} stroke="var(--border-strong)" />
            <Tooltip content={<MoneyTooltip xLabel={xLabel} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text)' }} />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.25}
                strokeDasharray={s.dashed ? '6 4' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted">
        <span className="font-semibold text-text">{title}. </span>
        {summary}
      </figcaption>
    </figure>
  );
}

/** Percentile fan chart for Monte Carlo bands (p10–p90 and p25–p75 ranges, median line, invested line). */
export function FanChart({
  data,
  title,
  summary,
  height = 320,
}: {
  data: Array<{ year: number; invested: number; p10: number; p25: number; p50: number; p75: number; p90: number }>;
  title: string;
  summary: React.ReactNode;
  height?: number;
}) {
  const rows = data.map((d) => ({ ...d, outer: [d.p10, d.p90] as [number, number], inner: [d.p25, d.p75] as [number, number] }));
  return (
    <figure className="space-y-2">
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={axisTick} tickFormatter={(v) => `Yr ${v}`} stroke="var(--border-strong)" />
            <YAxis tick={axisTick} tickFormatter={(v: number) => formatINRCompact(v)} width={72} stroke="var(--border-strong)" />
            <Tooltip content={<MoneyTooltip xLabel={(v) => `Year ${v}`} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="outer" name="10th–90th percentile" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} isAnimationActive={false} />
            <Area dataKey="inner" name="25th–75th percentile" stroke="none" fill="var(--chart-1)" fillOpacity={0.3} isAnimationActive={false} />
            <Area dataKey="p50" name="Median (50th)" stroke="var(--chart-1)" strokeWidth={2.25} fill="none" isAnimationActive={false} />
            <Area dataKey="invested" name="Invested" stroke="var(--chart-2)" strokeDasharray="6 4" strokeWidth={2} fill="none" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted">
        <span className="font-semibold text-text">{title}. </span>
        {summary}
      </figcaption>
    </figure>
  );
}
