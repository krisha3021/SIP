'use client';

import { useId } from 'react';

export interface NumberFieldProps {
  /** Stable key, used for ids and for mapping engine `error.field`. */
  name: string;
  label: string;
  /** Raw text as typed. Never coerced. */
  value: string;
  onChange: (raw: string) => void;
  sliderMin: number;
  sliderMax: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  hint?: React.ReactNode;
  error?: string | null;
  /** Formats the slider's position for assistive tech (aria-valuetext). */
  formatValue?: (n: number) => string;
  /** Visually smaller layout for dense forms. */
  compact?: boolean;
  /** Hide the slider (e.g. for optional caps). */
  noSlider?: boolean;
}

/** Parses user text into a number. Accepts digit grouping commas and spaces; returns null for anything else. */
export function parseNumberInput(raw: string): number | null {
  const s = raw.replace(/[,\s_]/g, '');
  if (!/^[-−]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s.replace('−', '-'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Accessible numeric input paired with a range slider. Both control the same value.
 * The text box is the source of truth: the slider never clamps what the user typed; it only
 * pins to its end when the typed value is outside the slider's range.
 */
export function NumberField({
  name,
  label,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  prefix,
  suffix,
  hint,
  error,
  formatValue,
  compact,
  noSlider,
}: NumberFieldProps) {
  const uid = useId();
  const inputId = `${name}-${uid}`;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-error`;
  const parsed = parseNumberInput(value);
  const sliderValue = parsed === null ? sliderMin : Math.min(sliderMax, Math.max(sliderMin, parsed));
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <label htmlFor={inputId} className="block text-sm font-medium text-text">
        {label}
      </label>
      <div
        className={`flex items-center rounded-md border bg-surface focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${
          error ? 'border-danger' : 'border-line-strong'
        }`}
      >
        {prefix && (
          <span className="pl-3 text-sm text-muted" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="num min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-text outline-none"
        />
        {suffix && (
          <span className="pr-3 text-sm text-muted" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {!noSlider && (
        <input
          type="range"
          aria-label={`${label} slider`}
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={sliderValue}
          aria-valuetext={formatValue ? formatValue(sliderValue) : String(sliderValue)}
          onChange={(e) => onChange(e.target.value)}
          className="no-print block w-full"
          tabIndex={0}
        />
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
