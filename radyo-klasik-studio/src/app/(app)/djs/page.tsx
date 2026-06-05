"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader, ComingSoon } from "@/components/ui";

export default function DjsPage() {
  return (
    <SectionGuard section="djs">
      <PageHeader title="DJ Management" subtitle="Users, roles & show profiles" />
      <div className="space-y-4 p-6">
        <ComingSoon feature="DJ & guest user management, roles, access control" phase="Phase 7" />
        <ComingSoon feature="Show & episode profiles, per-DJ mic preferences" phase="Phase 7" />
      </div>
    </SectionGuard>
  );
}
