'use client';

import { useSyncExternalStore } from 'react';

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

/** Formats an instant as India Standard Time: "Sunday, 18 October 2026 | 12:24:00 PM IST". Built from parts so ICU punctuation can't drift. */
export function formatIST(d: Date): { date: string; time: string; full: string } {
  const dp = Object.fromEntries(DATE_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  const tp = Object.fromEntries(TIME_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  const date = `${dp.weekday}, ${dp.day} ${dp.month} ${dp.year}`;
  const time = `${tp.hour}:${tp.minute}:${tp.second} ${String(tp.dayPeriod ?? '').toUpperCase()} IST`;
  return { date, time, full: `${date} | ${time}` };
}

const TOOLTIP =
  "From this device's clock, shown in India Standard Time. It is not independently verified server time, and it says nothing about how current any fund data is.";

/**
 * Header clock. Renders only after mount (the server cannot know the visitor's clock), ticks once a second in its own
 * state so nothing else re-renders, and is deliberately not an aria-live region.
 */
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
/** Whole seconds since the epoch: stable between calls within one second, as useSyncExternalStore requires. */
const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => null;

export function CurrentTimeIST() {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = seconds === null ? null : new Date(seconds * 1000);
  const f = now ? formatIST(now) : null;
  return (
    <div data-clock title={TOOLTIP} className="flex min-w-[6.5rem] flex-col items-end leading-tight md:min-w-[17rem] print:hidden">
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">Current time — IST</span>
      {f && now ? (
        <time dateTime={now.toISOString()} className="num text-xs text-text">
          <span className="hidden md:inline">{f.date}</span>
          <span className="hidden md:inline" aria-hidden="true">
            {' | '}
          </span>
          <span>{f.time}</span>
        </time>
      ) : (
        <span className="num text-xs text-muted" aria-hidden="true">
          &nbsp;
        </span>
      )}
    </div>
  );
}
