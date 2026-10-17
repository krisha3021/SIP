'use client';

import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GlidePathRow, LifeStageResult } from '@/contracts';

const tick = { fill: 'var(--text-muted)', fontSize: 12 };
const PFRDA_COLORS = ['var(--chart-2)', 'var(--chart-3)', 'var(--text-muted)', 'var(--danger)'];

/**
 * Equity range band by age (min–max, never a point), with optional PFRDA reference lines.
 * Rows are the engine's glide path, re-keyed for the chart; nothing is computed here.
 */
export function GlidePathChart({
  rows,
  pfrda,
  retirementAge,
  pfrdaHoldsAfterAge,
}: {
  rows: GlidePathRow[];
  pfrda: LifeStageResult['pfrdaReference'];
  retirementAge: number;
  pfrdaHoldsAfterAge: number;
}) {
  const data = rows.map((r, i) => {
    const rec: Record<string, number | [number, number]> = {
      age: r.age,
      equity: [r.range.equity.min, r.range.equity.max],
      debt: [r.range.debt.min, r.range.debt.max],
    };
    pfrda?.series.forEach((s, j) => {
      const p = s.points[i];
      if (p) rec[`pfrda${j}`] = p.equityPct;
    });
    return rec;
  });
  return (
    <div style={{ height: 320 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} data={data} margin={{ top: 16, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis dataKey="age" tick={tick} stroke="var(--border-strong)" />
          <YAxis domain={[0, 100]} tick={tick} tickFormatter={(v: number) => `${v}%`} width={48} stroke="var(--border-strong)" />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12 }}
            labelFormatter={(l) => `Age ${l}`}
            formatter={(v, n) => [Array.isArray(v) ? `${v[0]}–${v[1]}%` : `${v}%`, n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="equity" name="Equity range" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.3} isAnimationActive={false} />
          <Area dataKey="debt" name="Debt range" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12} isAnimationActive={false} />
          <ReferenceLine x={retirementAge} stroke="var(--border-strong)" strokeDasharray="4 4" label={{ value: 'Retirement', fill: 'var(--text-muted)', fontSize: 11, position: 'top' }} />
          {pfrda && (
            <ReferenceLine x={pfrdaHoldsAfterAge} stroke="var(--warning)" strokeDasharray="2 4" label={{ value: `After ${pfrdaHoldsAfterAge}: Lakshya's extension`, fill: 'var(--warning)', fontSize: 11, position: 'insideTopRight' }} />
          )}
          {pfrda?.series.map((s, j) => (
            <Line key={s.name} dataKey={`pfrda${j}`} name={`PFRDA ${s.name}`} stroke={PFRDA_COLORS[j % PFRDA_COLORS.length]} strokeDasharray="5 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A 0–100% track with the min–max band filled. Positioning only; the numbers come from the engine. */
export function RangeBar({ label, min, max, color }: { label: string; min: number; max: number; color: string }) {
  return (
    <div className="space-y-1" data-testid={`range-${label.toLowerCase()}`}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="num font-semibold">
          {min}–{max}%
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-surface-2" aria-hidden="true">
        <div className="absolute inset-y-0 rounded-full" style={{ left: `${min}%`, width: `${Math.max(max - min, 0.75)}%`, background: color }} />
      </div>
    </div>
  );
}
