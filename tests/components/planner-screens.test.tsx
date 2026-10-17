// @vitest-environment jsdom
import './setup-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALLOCATION_NOTICE, LIFE_STAGE_NOTICE, compareScenarios, exploreAllocation, planCashFlow } from '@/contracts';
import { LifeStagePlanner } from '@/features/planner/ui/LifeStagePlanner';
import { CashFlowPlanner } from '@/features/calculators/ui/CashFlowPlanner';
import { RetirementPlanner } from '@/features/calculators/ui/RetirementPlanner';
import { AllocationExplorer } from '@/features/calculators/ui/AllocationExplorer';
import { ScenarioLab } from '@/features/scenarios/ui/ScenarioLab';
import { formatINR } from '@/lib/format/inr';

// Expected scores come from tests/finance/lifeStage.test.ts ("steady household", hand-worked by Agent 2):
// capacity 30+15+20+12+15 = 92, tolerance 50+22 = 72.
const STEADY = { cur: '30', ret: '60', hz: '20', eft: '6', dep: '1', earn: '2', inc: '100000', ess: '40000', emi: '10000', efh: '6' };
const SENSITIVE_KEYS = ['inc', 'ess', 'emi', 'dep', 'earn', 'efh', 'oth', 'disc', 'inv', 'efs', 'amt'];

afterEach(() => vi.restoreAllMocks());

/** Sets a field's text in one change event (typing every character is slow and adds nothing here). */
async function fill(_user: ReturnType<typeof userEvent.setup>, label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), { target: { value } });
}

/** user-event installs its own clipboard stub; read what the Share button wrote to it. */
async function copiedUrl(): Promise<string> {
  return navigator.clipboard.readText();
}

function queryKeys(url: string): string[] {
  return [...new URL(url).searchParams.keys()];
}

describe('Life-stage & Risk Planner', () => {
  it('shows the notice verbatim, both scores with factors, and which score set the profile', async () => {
    const user = userEvent.setup();
    render(<LifeStagePlanner />);
    await fill(user, 'Current age', STEADY.cur);
    await fill(user, 'Target retirement age', STEADY.ret);
    await fill(user, 'Investment horizon (when you need this money)', STEADY.hz);
    await fill(user, 'People who depend on household income', STEADY.dep);
    await fill(user, 'Earning members', STEADY.earn);
    await fill(user, 'Monthly household income (after tax)', STEADY.inc);
    await fill(user, 'Monthly essential expenses', STEADY.ess);
    await fill(user, 'Monthly loan EMIs', STEADY.emi);
    await fill(user, 'Emergency fund you hold, in months of expenses', STEADY.efh);
    await fill(user, 'Your emergency-fund target', STEADY.eft);

    const notices = screen.getAllByTestId('mandatory-notice');
    expect(notices.length).toBeGreaterThanOrEqual(2);
    notices.forEach((n) => expect(n).toHaveTextContent(LIFE_STAGE_NOTICE));
    const scores = screen.getByTestId('scores');
    expect(within(scores).getByLabelText('Risk capacity (your situation)')).toHaveTextContent('92 / 100');
    expect(within(scores).getByLabelText('Risk tolerance (your answers)')).toHaveTextContent('72 / 100');
    expect(screen.getByTestId('profile')).toHaveTextContent('Set by: tolerance');
    // Ranges are min–max bands, never one point.
    expect(screen.getByTestId('range-equity')).toHaveTextContent(/\d+–\d+%/);
  });

  it('shows the engine error at the retirement-age field when it is not after the current age', async () => {
    const user = userEvent.setup();
    render(<LifeStagePlanner />);
    await fill(user, 'Target retirement age', '30');
    const ret = screen.getByLabelText('Target retirement age', { selector: 'input' });
    expect(ret).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('Target retirement age must be greater than current age').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('scores')).not.toBeInTheDocument();
  });

  it('PFRDA comparison carries its source link and the extension label', async () => {
    const user = userEvent.setup();
    render(<LifeStagePlanner />);
    await user.click(screen.getByLabelText(/PFRDA NPS Auto Choice/));
    const src = screen.getByTestId('pfrda-source');
    expect(within(src).getByRole('link')).toHaveAttribute('href', expect.stringContaining('pfrda.org.in'));
    expect(src).toHaveTextContent("Values after age 55 are Lakshya's extension");
  });

  it('never puts household finances in the share link', async () => {
    const user = userEvent.setup();
    render(<LifeStagePlanner />);
    await fill(user, 'Monthly household income (after tax)', '987654');
    await user.click(screen.getByRole('button', { name: /share link/i }));
    const url = await copiedUrl();
    expect(url).toContain('/calculators/life-stage-planner');
    expect(url).not.toContain('987654');
    expect(queryKeys(url).filter((k) => SENSITIVE_KEYS.includes(k))).toEqual([]);
  });

  it('ignores household finances in an incoming link', () => {
    render(<LifeStagePlanner params={{ inc: '5', emi: '999999', cur: '40' }} />);
    expect(screen.getByLabelText('Monthly household income (after tax)', { selector: 'input' })).toHaveValue('120000');
    expect(screen.getByLabelText('Current age', { selector: 'input' })).toHaveValue('40');
  });
});

describe('Household cash-flow planner', () => {
  it('shows a shortfall honestly, with the engine value', async () => {
    const user = userEvent.setup();
    render(<CashFlowPlanner />);
    await fill(user, 'Discretionary expenses', '60000');
    const expected = planCashFlow({
      monthlyTakeHomeIncome: 100000,
      otherMonthlyIncome: 0,
      essentialExpenses: 45000,
      discretionaryExpenses: 60000,
      loanEmis: 15000,
      existingMonthlyInvestments: 10000,
      emergencyFundMonths: 6,
      emergencyFundBasis: 'essential',
      currentEmergencySavings: 150000,
    });
    if (!expected.ok) throw new Error('fixture should be valid');
    const kpi = screen.getByTestId('kpi-surplus');
    expect(kpi).toHaveTextContent('Monthly shortfall');
    expect(kpi).toHaveTextContent(formatINR(expected.value.surplus));
    expect(screen.getByText('Monthly outflows are higher than income')).toBeInTheDocument();
  });

  it('keeps income and expenses out of the share link', async () => {
    const user = userEvent.setup();
    render(<CashFlowPlanner />);
    await user.click(screen.getByRole('button', { name: /share link/i }));
    const url = await copiedUrl();
    expect(url).toContain('/calculators/cash-flow');
    expect(queryKeys(url).filter((k) => SENSITIVE_KEYS.includes(k))).toEqual([]);
  });
});

describe('Retirement planner', () => {
  it('shows the engine error when retirement age is not after current age', async () => {
    const user = userEvent.setup();
    render(<RetirementPlanner />);
    await fill(user, 'Retirement age', '30');
    expect(screen.getByLabelText('Retirement age', { selector: 'input' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByText('Retirement age must be greater than current age').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('kpi-corpus')).not.toBeInTheDocument();
  });
});

describe('Allocation Explorer', () => {
  it('always shows the notice and follows the engine when the comfort level changes by keyboard', async () => {
    const user = userEvent.setup();
    render(<AllocationExplorer />);
    expect(screen.getByTestId('mandatory-notice')).toHaveTextContent(ALLOCATION_NOTICE);
    const balanced = screen.getByRole('radio', { name: 'In between' });
    balanced.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked();
    const expected = exploreAllocation({ age: 35, horizonYears: 15, selfDescribedRiskComfort: 'comfortable' });
    if (!expected.ok) throw new Error('fixture should be valid');
    expect(screen.getByTestId('kpi-equity')).toHaveTextContent(`${expected.value.equityPct.toFixed(1)}%`);
  });
});

describe('Scenario Lab', () => {
  it('uses compareScenarios and shows its error for duplicate labels', async () => {
    const user = userEvent.setup();
    render(<ScenarioLab />);
    const expected = compareScenarios({
      scenarios: [
        { label: 'Steady', input: { monthlyContribution: 10000, initialCorpus: 0, months: 240, annualReturnPct: 10, stepUp: { mode: 'none' }, inflationPct: 6 } },
        { label: 'Step-up', input: { monthlyContribution: 10000, initialCorpus: 0, months: 240, annualReturnPct: 10, stepUp: { mode: 'percent', value: 10 }, inflationPct: 6 } },
      ],
    });
    if (!expected.ok) throw new Error('fixture should be valid');
    expect(screen.getByTestId('result-summary')).toHaveTextContent(`Highest projected value: ${expected.value.highestFinalValue}`);
    const names = screen.getAllByLabelText('Scenario name');
    await user.clear(names[1]!);
    await user.type(names[1]!, 'Steady');
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('Scenario labels must be unique'))).toBe(true);
  });
});
