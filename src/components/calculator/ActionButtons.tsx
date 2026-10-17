'use client';

import { useState } from 'react';
import { Bookmark, Download, FileSpreadsheet, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import type { Report } from '@/contracts';
import { savePlan } from '@/features/plans/ui/storage';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function datedName(base: string, ext: string) {
  return `lakshya-${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** CSV/XLSX download. The export module (and ExcelJS inside it) loads only when clicked. */
export function ExportButtons({ buildReport, fileBase, disabled }: { buildReport: () => Report; fileBase: string; disabled?: boolean }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'csv' | 'xlsx') => {
    setBusy(true);
    setStatus(`Preparing ${kind.toUpperCase()}…`);
    try {
      // Loaded on demand; ExcelJS itself loads lazily inside reportToXlsx.
      const { reportToCsv, reportToXlsx } = await import('@/contracts');
      const report = buildReport();
      if (kind === 'csv') {
        triggerDownload(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }), datedName(fileBase, 'csv'));
      } else {
        const bytes = await reportToXlsx(report);
        triggerDownload(
          new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          datedName(fileBase, 'xlsx'),
        );
      }
      setStatus(`${kind.toUpperCase()} downloaded.`);
    } catch {
      setStatus(`Could not create the ${kind.toUpperCase()} file. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => run('csv')} disabled={disabled || busy}>
        <Download aria-hidden="true" size={16} />
        CSV
      </Button>
      <Button onClick={() => run('xlsx')} disabled={disabled || busy}>
        <FileSpreadsheet aria-hidden="true" size={16} />
        Excel
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </>
  );
}

/** Copies a link containing only the non-sensitive assumptions in `query`. */
export function ShareButton({ path, query }: { path: string; query: string }) {
  const [msg, setMsg] = useState('');
  const [fallback, setFallback] = useState<string | null>(null);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}${path}${query ? `?${query}` : ''}`;

  return (
    <>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setMsg('Link copied. It contains only the assumptions shown on this page.');
            setFallback(null);
          } catch {
            setFallback(url);
            setMsg('Copy the link below.');
          }
        }}
      >
        <Link2 aria-hidden="true" size={16} />
        Share link
      </Button>
      <span role="status" aria-live="polite" className="basis-full text-xs text-muted empty:hidden">
        {msg}
      </span>
      {fallback && (
        <input
          readOnly
          value={fallback}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="basis-full rounded-md border border-line-strong bg-surface px-2 py-1 text-xs"
        />
      )}
    </>
  );
}

export function SavePlanButton({ calculator, path, query, defaultName }: { calculator: string; path: string; query: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [msg, setMsg] = useState('');

  return (
    <>
      <Button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bookmark aria-hidden="true" size={16} />
        Save
      </Button>
      {open && (
        <div className="flex basis-full flex-wrap items-end gap-2 rounded-md border border-line bg-surface-2 p-2">
          <label className="flex min-w-48 flex-1 flex-col text-sm">
            <span className="font-medium">Plan name</span>
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 rounded-md border border-line-strong bg-surface px-2 py-1.5"
            />
          </label>
          <Button
            variant="primary"
            onClick={() => {
              const r = savePlan({ name: name.trim() || defaultName, calculator, path, query });
              setMsg(
                r.ok
                  ? 'Saved in this browser. See Saved Plans.'
                  : r.reason === 'limit'
                    ? 'You have reached the limit of 50 saved plans. Delete one first.'
                    : r.reason === 'unavailable'
                      ? 'This browser is blocking local storage, so the plan could not be saved.'
                      : 'The plan could not be saved.',
              );
              if (r.ok) setOpen(false);
            }}
          >
            Save plan
          </Button>
          <p className="basis-full text-xs text-muted">Stored only in this browser (localStorage). Nothing is sent to a server.</p>
        </div>
      )}
      <span role="status" aria-live="polite" className="basis-full text-xs text-muted empty:hidden">
        {msg}
      </span>
    </>
  );
}
