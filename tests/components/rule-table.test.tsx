// @vitest-environment jsdom
import './setup-dom';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LIFE_STAGE_CONFIG, lifeStageConfigSchema } from '@/contracts';
import { LifeStagePlanner } from '@/features/planner/ui/LifeStagePlanner';

const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

describe('Life-stage rule-table editor', () => {
  it('starts from the published table, which the engine schema accepts', () => {
    expect(lifeStageConfigSchema.safeParse(LIFE_STAGE_CONFIG).success).toBe(true);
    render(<LifeStagePlanner />);
    expect(input('capacity.horizonYears.maxPoints')).toHaveValue(String(LIFE_STAGE_CONFIG.capacity.horizonYears.maxPoints));
    expect(screen.queryByTestId('edited-rules')).not.toBeInTheDocument();
  });

  it('shows the engine validation error and no result for an invalid table', () => {
    render(<LifeStagePlanner />);
    fireEvent.change(input('capacity.horizonYears.maxPoints'), { target: { value: '31' } });
    expect(screen.getByText('These edits cannot be used')).toBeInTheDocument();
    expect(screen.getByText(/Capacity weights must sum to 100/)).toBeInTheDocument();
    expect(screen.getByText('No result: the edited rule table is not valid')).toBeInTheDocument();
    expect(screen.queryByTestId('scores')).not.toBeInTheDocument();
  });

  it('flags a valid edit and resets it', async () => {
    const user = userEvent.setup();
    render(<LifeStagePlanner />);
    fireEvent.change(input('tolerance.lossReaction.points.hold'), { target: { value: '40' } });
    expect(screen.getByTestId('edited-rules')).toHaveTextContent("Edited rules — differs from Lakshya's published table");
    expect(screen.getByLabelText('Risk tolerance (your answers)')).toHaveTextContent('62 / 100'); // 40 + 22 (3–10 years), both from the edited/published tables
    await user.click(screen.getAllByRole('button', { name: 'Reset to the published table' })[0]!);
    expect(screen.queryByTestId('edited-rules')).not.toBeInTheDocument();
    expect(input('tolerance.lossReaction.points.hold')).toHaveValue(String(LIFE_STAGE_CONFIG.tolerance.lossReaction.points.hold));
  });
});
