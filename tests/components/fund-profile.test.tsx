// @vitest-environment jsdom
import './setup-dom';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { availableField, unavailableField, type FieldContext } from '@/contracts';
import { ResearchFieldList } from '@/features/funds/ui/FieldRow';
import { RatingDisplay } from '@/features/funds/ui/RatingDisplay';
import { PerformanceSection } from '@/features/funds/ui/PerformanceSection';

const ctx: FieldContext = { scheme_id: 1, plan_type: 'Direct', option_type: 'Growth', provider: 'AMFI', source_url: 'https://www.amfiindia.com/x', retrieved_at: '2026-10-19T04:00:00.000Z', license_or_usage_status: 'permitted' };

describe('ResearchFieldList', () => {
  it('shows a blocked field as "Not available" with its reason and never a number', () => {
    const ter = unavailableField('blocked-licensing', 'Awaiting AMFI written permission to display its data publicly.', { ...ctx, license_or_usage_status: 'awaiting-permission' }, 'percent', 'plan');
    render(<ResearchFieldList fields={{ ter }} />);
    const row = screen.getByText('Total expense ratio').closest('div')!;
    expect(within(row).getByText(/Not available — awaiting data permission/)).toBeInTheDocument();
    expect(within(row).getByText(/Awaiting AMFI written permission/)).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });

  it('shows an available value with its unit, observation date and source', () => {
    const ter = availableField(0.63, 'percent', { ...ctx, scope: 'plan', observation_date: '2026-10-01' });
    render(<ResearchFieldList fields={{ ter }} />);
    const row = screen.getByText('Total expense ratio').closest('div')!;
    expect(within(row).getByText('0.63%')).toBeInTheDocument();
    expect(within(row).getByText(/as of 2026-10-01/)).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /source/i })).toHaveAttribute('href', 'https://www.amfiindia.com/x');
  });

  it('labels scheme AUM as an average for its quarter, never "current AUM"', () => {
    const aaum = { ...availableField(98765.43, 'inr-crore', { ...ctx, plan_type: 'Unknown', option_type: 'Unknown', scope: 'scheme-aaum', observation_date: '2026-09-30' }), reason: 'Scheme average AUM for Jul–Sep 2026 (both plans combined).' };
    render(<ResearchFieldList fields={{ aaum }} />);
    const row = screen.getByText('Scheme average AUM').closest('div')!;
    expect(within(row).getByText('₹98,765.43 crore')).toBeInTheDocument();
    expect(within(row).getByText(/Jul–Sep 2026/)).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/current AUM/i);
  });
});

describe('RatingDisplay', () => {
  it('shows "Rating unavailable" — never zero stars — when no licensed provider supplied one', () => {
    const rating = unavailableField('not-configured', 'No licensed rating provider is configured.', { ...ctx, license_or_usage_status: 'unlicensed' }, 'rating', 'plan');
    const { container } = render(<RatingDisplay field={rating} />);
    expect(screen.getByText('Rating unavailable')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/★|☆/);
  });

  it('shows stars only with provider, scale, date, context and attribution when licensed', () => {
    const rating = availableField(4, 'rating', { ...ctx, provider: 'Example Ratings Ltd', scope: 'plan', observation_date: '2026-09-30' });
    render(<RatingDisplay field={rating} meta={{ scale: 5, category: 'Flexi Cap', methodologyUrl: 'https://ratings.example/method', attribution: 'Rating © Example Ratings Ltd. Used under licence.' }} />);
    expect(screen.getByRole('img', { name: '4 out of 5 — Example Ratings Ltd' })).toBeInTheDocument();
    expect(screen.getByText(/2026-09-30/)).toBeInTheDocument();
    expect(screen.getByText(/Flexi Cap/)).toBeInTheDocument();
    expect(screen.getByText(/Used under licence/)).toBeInTheDocument();
    expect(screen.getByText(/not a prediction of future performance/i)).toBeInTheDocument();
  });

  it('refuses to render stars for a rating that is not licensed for display, even if a value exists', () => {
    const rating = { ...availableField(5, 'rating', { ...ctx, scope: 'plan', observation_date: '2026-09-30' }), license_or_usage_status: 'unlicensed' as const };
    render(<RatingDisplay field={rating} meta={{ scale: 5, category: 'x', attribution: 'x' }} />);
    expect(screen.getByText('Rating unavailable')).toBeInTheDocument();
  });
});

describe('PerformanceSection', () => {
  it('labels periods longer than the history "Insufficient history" and states the method', () => {
    const navs = Array.from({ length: 90 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), nav: 10 + i * 0.01 }));
    render(<PerformanceSection navs={navs} />);
    const row = screen.getByRole('row', { name: /3 years/ });
    expect(within(row).getByText('Insufficient history')).toBeInTheDocument();
    expect(screen.getByText(/ACT\/365/)).toBeInTheDocument();
    expect(screen.getByText(/Past performance/i)).toBeInTheDocument();
  });
});
