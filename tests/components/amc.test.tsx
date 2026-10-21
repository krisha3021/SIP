// @vitest-environment jsdom
import './setup-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmcDirectory } from '@/features/amc/ui/AmcDirectory';
import { FundSearch } from '@/features/funds/ui/FundSearch';
import { AMCS } from '@/lib/data/amc/registry';

afterEach(() => vi.unstubAllGlobals());

describe('AMC directory', () => {
  it('lists every registered fund house with its SEBI number', () => {
    render(<AmcDirectory amcs={AMCS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(AMCS.length);
    expect(screen.getByRole('status')).toHaveTextContent(`Showing ${AMCS.length} of ${AMCS.length}`);
    const hdfc = screen.getByRole('link', { name: 'HDFC Mutual Fund' }).closest('li')!;
    expect(within(hdfc).getByText('MF/044/00/6')).toBeInTheDocument();
    expect(within(hdfc).getByRole('link', { name: /official site/i })).toHaveAttribute('href', 'https://www.hdfcfund.com/');
  });

  it('says "Website not recorded" rather than guessing a URL', () => {
    render(<AmcDirectory amcs={AMCS} />);
    const helios = screen.getByRole('link', { name: 'Helios Mutual Fund' }).closest('li')!;
    expect(within(helios).getByText('Website not recorded')).toBeInTheDocument();
    expect(within(helios).queryByRole('link', { name: /official site/i })).not.toBeInTheDocument();
  });

  it('filters by name, city or registration number, and reports empty results', async () => {
    const user = userEvent.setup();
    render(<AmcDirectory amcs={AMCS} />);
    const box = screen.getByLabelText('Filter fund houses');
    await user.type(box, 'chennai');
    const names = screen.getAllByRole('listitem').map((li) => within(li).getAllByRole('link')[0]!.textContent);
    expect(names).toEqual(['Sundaram Mutual Fund', 'Unifi Mutual Fund']);
    await user.clear(box);
    await user.type(box, 'MF/009/93/3');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'SBI Mutual Fund' })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'zzzz');
    expect(screen.getByText(/No registered fund house matches/)).toBeInTheDocument();
  });

  it('sorts by registration date', async () => {
    const user = userEvent.setup();
    render(<AmcDirectory amcs={AMCS} />);
    await user.selectOptions(screen.getByLabelText('Sort by'), 'oldest');
    const first = within(screen.getAllByRole('listitem')[0]!).getAllByRole('link')[0]!;
    expect(first).toHaveTextContent('Taurus Mutual Fund'); // registered 1993-09-21, the earliest date in the SEBI register
  });
});

describe('FundSearch initialQuery', () => {
  it('runs the given search once on mount and pre-fills the box', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            query: 'HDFC',
            provider: 'fixture',
            results: [
              {
                schemeCode: 1,
                schemeName: 'HDFC Fixture Fund - Direct Plan - Growth',
                plan: 'Direct',
                option: 'Growth',
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchSpy);
    render(<FundSearch label="Search HDFC schemes" initialQuery="HDFC" />);
    expect(screen.getByLabelText('Search HDFC schemes')).toHaveValue('HDFC');
    expect(await screen.findByText(/HDFC Fixture Fund/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('q=HDFC');
  });
});
