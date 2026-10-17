// @vitest-environment jsdom
import './setup-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { runMonteCarlo } from '@/contracts';
import { MonteCarlo } from '@/features/calculators/ui/MonteCarlo';
import { AccumulationCalculator } from '@/features/calculators/ui/AccumulationCalculator';
import { formatShare } from '@/features/calculators/ui/format';

// jsdom has no Worker, so the component runs the same chunked engine on the main thread (its documented fallback).

describe('Monte Carlo (chunked engine)', () => {
  it('shows a progress bar, then results identical to runMonteCarlo for the same inputs and seed', async () => {
    const params = { m: '10000', c: '0', y: '10', r: '12', vol: '16', s: '0', g: '2000000', i: '6', n: '1000', seed: '42' };
    render(<MonteCarlo params={params} />);
    expect(screen.getByTestId('mc-progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    const headline = await screen.findByTestId('mc-headline', {}, { timeout: 10_000 });
    const expected = runMonteCarlo({
      monthlyContribution: 10000,
      initialCorpus: 0,
      years: 10,
      expectedReturnPct: 12,
      volatilityPct: 16,
      annualStepUpPct: 0,
      timing: 'end',
      goalAmount: 2000000,
      goalInTodaysRupees: true,
      inflationPct: 6,
      simulations: 1000,
      seed: 42,
    });
    if (!expected.ok) throw new Error('fixture inputs should be valid');
    expect(headline).toHaveTextContent(formatShare(expected.value.goalSuccessRate));
    expect(headline).toHaveTextContent('seed 42');
    expect(screen.getByTestId('kpi-median')).toHaveTextContent(new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expected.value.terminal.p50));
  });

  it('can be cancelled, and then shows no result', async () => {
    const user = userEvent.setup();
    render(<MonteCarlo params={{ n: '10000', y: '40' }} />);
    await user.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(await screen.findByText('Simulation cancelled')).toBeInTheDocument();
    expect(screen.queryByTestId('mc-headline')).not.toBeInTheDocument();
  });
});

describe('CSV export via contract builders', () => {
  let blobs: Blob[] = [];
  beforeEach(() => {
    blobs = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), 'blob:test'), revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads a report with attribution, projection label, conventions and engine values', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const text = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsText(blobs[0]!);
    });
    expect(text).toContain('Created by Alok Shukla');
    expect(text).toContain('Projection (assumption-based)');
    expect(text).toMatch(/end of (each )?month/i);
    expect(text).toContain('4714578.33'); // independent closed-form value (see calculator.test.tsx)
  });
});
