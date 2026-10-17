'use client';

import { Choice } from '@/components/ui/Choice';
import type { ContributionTiming, RateConvention } from '@/contracts';

export const TIMING_LABEL: Record<ContributionTiming, string> = {
  end: 'Contributions at the end of each month',
  begin: 'Contributions at the start of each month',
};
export const CONVENTION_LABEL: Record<RateConvention, string> = {
  effective: 'Effective annual rate (monthly = (1 + annual)^(1/12) − 1)',
  nominal: 'Nominal annual rate (monthly = annual ÷ 12)',
};

export function TimingField({ value, onChange }: { value: ContributionTiming; onChange: (v: ContributionTiming) => void }) {
  return (
    <Choice
      legend="Contribution timing"
      value={value}
      onChange={onChange}
      options={[
        { value: 'end', label: 'End of month', description: 'Ordinary annuity' },
        { value: 'begin', label: 'Start of month', description: 'Annuity due' },
      ]}
      hint="Start-of-month money earns one extra month of growth."
    />
  );
}

export function RateConventionField({ value, onChange }: { value: RateConvention; onChange: (v: RateConvention) => void }) {
  return (
    <Choice
      legend="Return rate convention"
      value={value}
      onChange={onChange}
      options={[
        { value: 'effective', label: 'Effective', description: '12% means 12% a year' },
        { value: 'nominal', label: 'Nominal', description: '12% ÷ 12 per month' },
      ]}
      hint="Nominal 12% compounds monthly to about 12.68% a year. Choose effective to compare with annual returns."
    />
  );
}
