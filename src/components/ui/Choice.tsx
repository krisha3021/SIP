'use client';

import { useId } from 'react';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Segmented radio group. Native radios give arrow-key navigation and correct semantics for free. */
export function Choice<T extends string>({
  legend,
  value,
  onChange,
  options,
  hint,
  name,
}: {
  legend: string;
  value: T;
  onChange: (v: T) => void;
  options: ChoiceOption<T>[];
  hint?: React.ReactNode;
  name?: string;
}) {
  const uid = useId();
  const groupName = name ?? `choice-${uid}`;
  const hintId = `${groupName}-hint`;
  return (
    <fieldset className="space-y-1.5" aria-describedby={hint ? hintId : undefined}>
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={`relative flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${
                checked ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line-strong bg-surface text-text hover:bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span className="font-medium">{o.label}</span>
              {o.description && <span className={`text-xs ${checked ? 'text-brand-strong' : 'text-muted'}`}>{o.description}</span>}
            </label>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  hint?: React.ReactNode;
}) {
  const uid = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={uid} className="block text-sm font-medium text-text">
        {label}
      </label>
      <select
        id={uid}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-describedby={hint ? `${uid}-hint` : undefined}
        className="block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${uid}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
