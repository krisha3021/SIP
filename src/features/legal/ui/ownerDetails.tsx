import { FilePenLine } from 'lucide-react';

/**
 * Owner-specific values for the legal pages. Every value is null until the site owner supplies it.
 * NEVER fill these with invented details. `reviewed` becomes true only after a qualified professional
 * has reviewed the final text. Until all values are set and `reviewed` is true, the draft banner shows.
 */
export const OWNER_DETAILS: {
  legalName: string | null;
  postalAddress: string | null;
  contactEmail: string | null;
  grievanceOfficer: string | null;
  logRetention: string | null;
  liabilityClause: string | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  effectiveDate: string | null;
  reviewed: boolean;
} = {
  legalName: null,
  postalAddress: null,
  contactEmail: null,
  grievanceOfficer: null,
  logRetention: null,
  liabilityClause: null,
  governingLaw: null,
  jurisdiction: null,
  effectiveDate: null,
  reviewed: false,
};

export const DRAFT_LABEL = 'Draft — owner to complete and have reviewed before launch';

export function legalPagesComplete(): boolean {
  const { reviewed, ...values } = OWNER_DETAILS;
  return reviewed && Object.values(values).every((v) => typeof v === 'string' && v.trim().length > 0);
}

/** Shows the owner's value, or a clearly marked placeholder. */
export function Owner({ field, label }: { field: Exclude<keyof typeof OWNER_DETAILS, 'reviewed'>; label: string }) {
  const v = OWNER_DETAILS[field];
  if (v) return <>{v}</>;
  return (
    <mark data-testid="owner-placeholder" className="rounded bg-warning-soft px-1 font-semibold text-warning">
      [OWNER TO SUPPLY: {label}]
    </mark>
  );
}

export function LegalDraftBanner() {
  if (legalPagesComplete()) return null;
  return (
    <div role="note" data-testid="legal-draft-banner" className="flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
      <FilePenLine aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{DRAFT_LABEL}</p>
        <p>
          This text describes how the site works today, but it is not final. Values marked “OWNER TO SUPPLY” must be provided by the site owner, and the whole text
          reviewed by a qualified professional, before public launch.
        </p>
      </div>
    </div>
  );
}
