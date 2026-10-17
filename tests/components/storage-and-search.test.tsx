// @vitest-environment jsdom
import './setup-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PLANS_KEY, readPlans, savePlan, deletePlan, safeStorage } from '@/features/plans/ui/storage';
import { FundSearch } from '@/features/funds/ui/FundSearch';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('saved plans storage', () => {
  it('saves, reads and deletes plans', () => {
    const r = savePlan({ name: 'My SIP', calculator: 'SIP projection', path: '/calculators/sip', query: 'm=5000' });
    expect(r.ok).toBe(true);
    const plans = readPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]!.name).toBe('My SIP');
    expect(deletePlan(plans[0]!.id)).toBe(true);
    expect(readPlans()).toHaveLength(0);
  });

  it('ignores corrupt or tampered data instead of crashing', () => {
    localStorage.setItem(PLANS_KEY, '{not json');
    expect(readPlans()).toEqual([]);
    localStorage.setItem(PLANS_KEY, JSON.stringify([{ id: 'x', name: 'evil', calculator: 'c', path: 'javascript:alert(1)', query: '', savedAt: 'now' }]));
    expect(readPlans()).toEqual([]);
  });

  it('degrades safely when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(safeStorage.available()).toBe(false);
    expect(readPlans()).toEqual([]);
    expect(savePlan({ name: 'x', calculator: 'c', path: '/calculators/sip', query: '' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('fund search', () => {
  it('shows the API error message and no results on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'UPSTREAM_TIMEOUT', message: 'The NAV provider did not respond in time.' } }), { status: 504 })),
    );
    const user = userEvent.setup();
    render(<FundSearch />);
    await user.type(screen.getByLabelText('Search mutual fund schemes'), 'flexi');
    await user.click(screen.getByRole('button', { name: /search/i }));
    expect(await screen.findByText('The NAV provider did not respond in time.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('validates the query length before calling the API', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<FundSearch />);
    await user.type(screen.getByLabelText('Search mutual fund schemes'), 'a{Enter}');
    expect(await screen.findByText('Enter at least 2 characters.')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lists results with plan and option labels, never inventing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              query: 'test',
              provider: 'Test provider',
              results: [
                { schemeCode: 100001, schemeName: 'Fixture Fund - Direct Plan - Growth', plan: 'Direct', option: 'Growth' },
                { schemeCode: 100002, schemeName: 'Fixture Fund Older Name', plan: 'Unknown', option: 'Unknown' },
              ],
            }),
          ),
      ),
    );
    const user = userEvent.setup();
    render(<FundSearch />);
    await user.type(screen.getByLabelText('Search mutual fund schemes'), 'test{Enter}');
    expect(await screen.findByText('Fixture Fund - Direct Plan - Growth')).toBeInTheDocument();
    expect(screen.getByText('Plan not stated')).toBeInTheDocument();
    expect(screen.getByText('Option not stated')).toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/funds/100001');
  });
});
