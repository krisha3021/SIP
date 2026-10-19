// @vitest-environment jsdom
import './setup-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { CurrentTimeIST, formatIST } from '@/components/layout/CurrentTimeIST';

describe('formatIST', () => {
  it('formats a UTC instant in India Standard Time with the required layout', () => {
    // 06:54:00 UTC + 05:30 = 12:24:00 PM IST on Sunday 18 October 2026.
    expect(formatIST(new Date('2026-10-18T06:54:00Z'))).toEqual({
      date: 'Sunday, 18 October 2026',
      time: '12:24:00 PM IST',
      full: 'Sunday, 18 October 2026 | 12:24:00 PM IST',
    });
  });

  it('rolls the date over at IST midnight, not UTC midnight', () => {
    // 18:30 UTC on 18 Oct is 00:00 IST on 19 Oct.
    expect(formatIST(new Date('2026-10-18T18:30:00Z')).full).toBe('Monday, 19 October 2026 | 12:00:00 AM IST');
  });
});

describe('CurrentTimeIST', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T06:54:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows the label and the device time in IST after mount, then ticks every second', () => {
    render(<CurrentTimeIST />);
    expect(screen.getByText('Current time — IST')).toBeInTheDocument();
    expect(screen.getByText('12:24:00 PM IST')).toBeInTheDocument();
    expect(screen.getByText('Sunday, 18 October 2026')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('12:24:01 PM IST')).toBeInTheDocument();
  });

  it('discloses that it uses the device clock and uses a machine-readable <time>', () => {
    const { container } = render(<CurrentTimeIST />);
    const wrapper = container.querySelector('[data-clock]')!;
    expect(wrapper.getAttribute('title')).toMatch(/device's clock/i);
    expect(wrapper.getAttribute('title')).toMatch(/not independently verified/i);
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-18T06:54:00.000Z');
  });

  it('never announces every tick to screen readers', () => {
    const { container } = render(<CurrentTimeIST />);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('clears its interval on unmount', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<CurrentTimeIST />);
    unmount();
    expect(spy).toHaveBeenCalled();
  });

  it('server-renders a placeholder with no time value (no hydration mismatch)', () => {
    const html = renderToString(<CurrentTimeIST />);
    expect(html).toContain('Current time — IST');
    expect(html).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});
