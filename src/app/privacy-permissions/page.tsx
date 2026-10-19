import type { Metadata } from 'next';
import { PageBody, PageHeader } from '@/components/layout/PageHeader';
import { PrivacyPanel } from '@/features/permissions/ui/PrivacyPanel';

export const metadata: Metadata = {
  title: 'Privacy & Permissions',
  description: 'What Lakshya keeps on this device, which actions ask for permission, and how to clear or revoke them.',
};

export default function PrivacyPermissionsPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Privacy & Permissions' }]}
        title="Privacy & Permissions"
        lede="What stays on this device, what would ever leave it, and how each permission is asked for, enforced and revoked."
      />
      <PageBody>
        <PrivacyPanel />
      </PageBody>
    </>
  );
}
