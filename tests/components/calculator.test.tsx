// @vitest-environment jsdom
import './setup-dom';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccumulationCalculator } from '@/features/calculators/ui/AccumulationCalculator';
import { IncomeTaxCalculator } from '@/features/calculators/ui/IncomeTaxCalculator';
import { parseNumberInput } from '@/components/ui/NumberField';

// Expected values are computed independently (closed-form annuity in Python, not by the engine):
// SIP ₹10,000/month, 15 years, 12% effective, end-of-month → FV = 10000·((1+r)^180 − 1)/r, r = 1.12^(1/12) − 1.
const SIP_FV_EXACT = '₹47,14,578.33';
// Lumpsum ₹5,00,000 for 10 years at 10% effective → 500000·1.1^10.
const LUMPSUM_FV_EXACT = '₹12,96,871.23';

describe('parseNumberInput', () => {
  it('accepts plain and Indian-grouped numbers', () => {
    expect(parseNumberInput('25000')).toBe(25000);
    expect(parseNumberInput('1,00,000')).toBe(100000);
    expect(parseNumberInput(' 12.5 ')).toBe(12.5);
    expect(parseNumberInput('-3')).toBe(-3);
  });
  it('rejects anything that is not a number instead of coercing it', () => {
    for (const bad of ['', 'abc', '12abc', '1e5', '₹500', '--1', '.']) expect(parseNumberInput(bad)).toBeNull();
  });
});

describe('SIP calculator', () => {
  it('shows engine results with exact values and the projection label', () => {
    render(<AccumulationCalculator variant="sip" />);
    expect(screen.getByText('Projection (assumption-based)')).toBeInTheDocument();
    const value = screen.getByTestId('kpi-value');
    expect(within(value).getAllByText(SIP_FV_EXACT).length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('kpi-invested')).getAllByText('₹18,00,000.00').length).toBeGreaterThan(0);
    expect(screen.getByTestId('conventions')).toHaveTextContent('Contributions at the end of each month');
    expect(screen.getByTestId('conventions')).toHaveTextContent('Effective annual rate');
  });

  it('flags non-numeric input, links the error to the field, and shows no number', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    const input = screen.getByLabelText('Monthly SIP');
    await user.clear(input);
    await user.type(input, '10k');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const errorEl = describedBy.split(' ').map((id) => document.getElementById(id)).find((el) => el?.textContent?.includes('Enter a number'));
    expect(errorEl).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('No result for these inputs');
    expect(screen.queryByTestId('kpi-value')).not.toBeInTheDocument();
  });

  it('maps an engine validation error to the matching input', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    const years = screen.getByLabelText('Investment period');
    await user.clear(years);
    await user.type(years, '0');
    expect(years).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-value')).not.toBeInTheDocument();
  });

  it('reset restores the default assumptions', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    const input = screen.getByLabelText('Monthly SIP');
    await user.clear(input);
    await user.type(input, '999');
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByLabelText('Monthly SIP')).toHaveValue('10000');
  });

  it('switching timing to start-of-month changes the conventions line', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    await user.click(screen.getByRole('radio', { name: /start of month/i }));
    expect(screen.getByTestId('conventions')).toHaveTextContent('Contributions at the start of each month');
  });

  it('reads share-link params but ignores invalid ones', () => {
    render(<AccumulationCalculator variant="sip" params={{ m: '5000', y: 'abc', t: 'begin', rc: 'bogus' }} />);
    expect(screen.getByLabelText('Monthly SIP')).toHaveValue('5000');
    expect(screen.getByLabelText('Investment period')).toHaveValue('15');
    expect(screen.getByRole('radio', { name: /start of month/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^effective/i })).toBeChecked();
  });
});

describe('Lumpsum calculator', () => {
  it('matches the independent compound-growth value', () => {
    render(<AccumulationCalculator variant="lumpsum" />);
    expect(within(screen.getByTestId('kpi-value')).getAllByText(LUMPSUM_FV_EXACT).length).toBeGreaterThan(0);
  });
});

describe('Result view tabs', () => {
  it('support arrow-key navigation', async () => {
    const user = userEvent.setup();
    render(<AccumulationCalculator variant="sip" />);
    const chartTab = screen.getByRole('tab', { name: 'Chart' });
    chartTab.focus();
    await user.keyboard('{ArrowRight}');
    const yearly = screen.getByRole('tab', { name: 'Yearly table' });
    expect(yearly).toHaveAttribute('aria-selected', 'true');
    expect(yearly).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Monthly table' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Month-by-month projection' })).toBeInTheDocument();
  });
});

describe('Income-tax calculator', () => {
  it('keeps unverified years disabled and shows the engine explanation', () => {
    render(<IncomeTaxCalculator />);
    const option = screen.getByRole('option', { name: /2026-27/ });
    expect(option).toBeDisabled();
    expect(screen.getByText(/FY 2026-27 is disabled/)).toBeInTheDocument();
    expect(screen.getByText(/have not been verified yet/)).toBeInTheDocument();
    expect(screen.getByText(/Rules verified for FY 2025-26/)).toBeInTheDocument();
  });

  it('never seeds income from a share link', () => {
    render(<IncomeTaxCalculator params={{ sal: '9999999', fy: '2026-27' }} />);
    expect(screen.getByLabelText('Annual salary income (gross)')).toHaveValue('1500000');
    // An unverified year in the link falls back to a verified one.
    expect(screen.getByRole('combobox', { name: 'Financial year' })).toHaveValue('2025-26');
  });
});
