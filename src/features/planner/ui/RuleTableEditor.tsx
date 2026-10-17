'use client';

import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { LIFE_STAGE_CONFIG, lifeStageConfigSchema, type LifeStageConfig } from '@/contracts';
import { parseNumberInput } from '@/components/ui/NumberField';
import { Button, Notice } from '@/components/ui/primitives';

type Leaf = number | null;
type Path = Array<string | number>;
const key = (p: Path) => p.join('.');

const EDITED_SUFFIX = ' (edited in this browser)';

function humanize(k: string | number): string {
  if (typeof k === 'number') return `Row ${k + 1}`;
  return k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/Pct\b/g, '%')
    .replace(/^./, (c) => c.toUpperCase());
}

function getAt(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string | number, unknown> | undefined)?.[k], obj);
}

/** Every numeric (or null) leaf of the published table, with its path. */
function leaves(obj: unknown, path: Path = [], out: Array<{ path: Path; value: Leaf }> = []) {
  if (typeof obj === 'number' || obj === null) out.push({ path, value: obj as Leaf });
  else if (Array.isArray(obj)) obj.forEach((v, i) => leaves(v, [...path, i], out));
  else if (obj && typeof obj === 'object') Object.entries(obj).forEach(([k, v]) => leaves(v, [...path, k], out));
  return out;
}

const PUBLISHED_LEAVES = leaves(LIFE_STAGE_CONFIG);

export interface RuleTableState {
  /** The config to pass to the engine, or null when the edits do not validate. */
  config: LifeStageConfig | null;
  edited: boolean;
  /** Rows describing each change, for exports. */
  changes: Array<[path: string, published: Leaf, edited: Leaf]>;
  issues: Array<{ path: string; message: string }>;
  raw: Record<string, string>;
  setRaw: (path: string, text: string) => void;
  reset: () => void;
}

/**
 * Local-only edits to the planner's rule table. Text is kept as typed; the candidate table is
 * validated with the engine's own `lifeStageConfigSchema` before any use. Nothing goes into a URL.
 */
export function useRuleTable(): RuleTableState {
  const [raw, setRawState] = useState<Record<string, string>>({});

  const derived = useMemo(() => {
    const candidate = structuredClone(LIFE_STAGE_CONFIG) as unknown as Record<string, unknown>;
    const issues: Array<{ path: string; message: string }> = [];
    const changes: RuleTableState['changes'] = [];
    for (const { path, value } of PUBLISHED_LEAVES) {
      const k = key(path);
      if (!(k in raw)) continue;
      const text = raw[k]!.trim();
      let next: Leaf;
      if (text === '' && value === null) next = null;
      else {
        const n = parseNumberInput(text);
        if (n === null) {
          issues.push({ path: k, message: text === '' ? 'Enter a value' : 'Enter a number' });
          continue;
        }
        next = n;
      }
      const parent = getAt(candidate, path.slice(0, -1)) as Record<string | number, unknown>;
      parent[path[path.length - 1]!] = next;
      if (next !== value) changes.push([k, value, next]);
    }
    const edited = changes.length > 0;
    if (edited) candidate.version = `${LIFE_STAGE_CONFIG.version}${EDITED_SUFFIX}`;
    if (issues.length) return { config: null, edited: true, changes, issues };
    const parsed = lifeStageConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      return { config: null, edited: true, changes, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
    }
    return { config: edited ? (candidate as unknown as LifeStageConfig) : LIFE_STAGE_CONFIG, edited, changes, issues: [] };
  }, [raw]);

  return {
    ...derived,
    raw,
    setRaw: (path, text) => setRawState((prev) => ({ ...prev, [path]: text })),
    reset: () => setRawState({}),
  };
}

export function RuleTableEditor({ state }: { state: RuleTableState }) {
  const issueFor = (p: string) => state.issues.find((i) => i.path === p)?.message;

  const cell = (path: Path, label: string) => {
    const k = key(path);
    const published = getAt(LIFE_STAGE_CONFIG, path) as Leaf;
    const text = k in state.raw ? state.raw[k]! : published === null ? '' : String(published);
    const issue = issueFor(k);
    const changed = k in state.raw && text.trim() !== (published === null ? '' : String(published));
    return (
      <label className="flex min-w-0 flex-col text-xs">
        <span aria-hidden="true">{label}</span>
        <input
          name={k}
          aria-label={`${path.map(humanize).join(' › ')}`}
          inputMode="decimal"
          value={text}
          placeholder={published === null ? 'none' : undefined}
          onChange={(e) => state.setRaw(k, e.target.value)}
          aria-invalid={issue ? true : undefined}
          title={issue}
          className={`num mt-0.5 w-full rounded border bg-surface px-1.5 py-1 text-sm ${issue ? 'border-danger' : changed ? 'border-brand' : 'border-line-strong'}`}
        />
        {issue && <span className="text-danger">{issue}</span>}
      </label>
    );
  };

  const node = (value: unknown, path: Path): React.ReactNode => {
    const last = path[path.length - 1] ?? 'rules';
    if (typeof value === 'number' || value === null) return <div key={key(path)}>{cell(path, humanize(last))}</div>;
    if (typeof value === 'string') return null; // ids and the version are not editable
    if (Array.isArray(value)) {
      const flatRows = value.every((r) => r && typeof r === 'object' && !Array.isArray(r) && Object.values(r).every((x) => typeof x !== 'object' || x === null));
      if (flatRows) {
        const cols = Object.keys(value[0] ?? {});
        return (
          <fieldset key={key(path)} className="space-y-1">
            <legend className="text-sm font-medium">{humanize(last)}</legend>
            <div className="space-y-1">
              {value.map((row, i) => (
                <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                  {cols.map((c) => {
                    const v = (row as Record<string, unknown>)[c];
                    return typeof v === 'string' ? (
                      <span key={c} className="self-end text-xs">
                        {v}
                      </span>
                    ) : (
                      <div key={c}>{cell([...path, i, c], `${humanize(c)} (row ${i + 1})`)}</div>
                    );
                  })}
                </div>
              ))}
            </div>
          </fieldset>
        );
      }
      return value.map((v, i) => node(v, [...path, i]));
    }
    if (value && typeof value === 'object') {
      return (
        <fieldset key={key(path)} className="space-y-2 rounded-md border border-line p-2">
          {path.length > 0 && <legend className="px-1 text-sm font-semibold">{humanize(last)}</legend>}
          <div className="grid gap-2 sm:grid-cols-2">{Object.entries(value).map(([k, v]) => node(v, [...path, k]))}</div>
        </fieldset>
      );
    }
    return null;
  };

  return (
    <details className="rounded-xl border border-line bg-surface p-4" data-testid="rule-editor">
      <summary className="cursor-pointer font-semibold">Edit the rule table</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted">
          Every weight, threshold and range the planner uses, from Lakshya&apos;s published table (version {LIFE_STAGE_CONFIG.version}). Changes stay in this page only:
          they are never put in a share link or saved plan, but they are included in your CSV/Excel export. Each edit is checked with the planner&apos;s own validation
          before it is used.
        </p>
        <Button onClick={state.reset} disabled={!state.edited && state.issues.length === 0}>
          <RotateCcw aria-hidden="true" size={16} /> Reset to the published table
        </Button>
        {state.issues.length > 0 && (
          <div role="alert">
            <Notice tone="danger" title="These edits cannot be used">
              <ul className="list-disc pl-4">
                {state.issues.map((i) => (
                  <li key={`${i.path}-${i.message}`}>
                    <span className="font-mono text-xs">{i.path || 'table'}</span>: {i.message}
                  </li>
                ))}
              </ul>
            </Notice>
          </div>
        )}
        <div className="space-y-3">{node(LIFE_STAGE_CONFIG, [])}</div>
      </div>
    </details>
  );
}
