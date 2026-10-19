// @vitest-environment jsdom
import './setup-dom';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategyLab } from '@/features/strategy/ui/StrategyLab';

describe('StrategyLab', () => {
  it('runs locally with defaults and shows strategies, simulation label, notices and the deterministic explanation', () => {
    render(<StrategyLab />);
    expect(screen.getByText(/inputs stay on this device/i)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /strategy comparison/i });
    for (const name of [/^Fixed SIP/, /^Lump sum \+ SIP/]) expect(within(table).getByRole('rowheader', { name })).toBeInTheDocument();
    expect(screen.getAllByText(/Simulation — not an actual investment/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Downside and uncertainty' })).toBeInTheDocument();
    expect(screen.getAllByText(/not a recommendation of any strategy/i).length).toBeGreaterThanOrEqual(2); // mandatory notice + explanation notice
    expect(screen.getByText(/Not modelled: Systematic transfer plan/i)).toBeInTheDocument();
  });

  it('shows an input error and no results for an invalid monthly capacity', async () => {
    render(<StrategyLab />);
    const cap = screen.getByRole('textbox', { name: /monthly amount you can invest/i });
    await userEvent.clear(cap);
    await userEvent.type(cap, 'abc');
    expect(screen.getByText(/enter a number/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /strategy comparison/i })).toBeNull();
  });

  it('shows the engine error when allocation weights do not add up to 100', async () => {
    render(<StrategyLab />);
    await userEvent.click(screen.getByText(/assumptions for returns, volatility and mixes/i));
    const eq = screen.getByRole('textbox', { name: /mix 1 equity/i });
    await userEvent.clear(eq);
    await userEvent.type(eq, '90');
    expect(screen.getByText(/must add up to 100/i)).toBeInTheDocument();
  });
});

describe('review fix — screen-reader announcements', () => {
  it('does not make the whole results area live; announces a short summary instead', () => {
    const { container } = render(<StrategyLab />);
    expect(container.querySelector('[aria-live] table')).toBeNull();
    expect(screen.getByRole('status', { name: /results status/i })).toHaveTextContent(/results updated/i);
  });
});
