import { Notice } from '@/components/ui/primitives';

/** Placeholder notice for content only the site owner can supply. Never replace it with invented details. */
export function OwnerToSupply({ what }: { what: string }) {
  return (
    <Notice tone="warning" title="Owner to supply before launch">
      <p>{what} This page must not go live until the site owner provides and approves this content.</p>
    </Notice>
  );
}
