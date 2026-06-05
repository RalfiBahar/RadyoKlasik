"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader, ComingSoon } from "@/components/ui";

export default function StudioPage() {
  return (
    <SectionGuard section="studio">
      <PageHeader title="Virtual Studio" subtitle="Live broadcasting console" />
      <div className="p-6">
        <ComingSoon feature="Virtual Studio console" phase="Phase 5 — Window C" />
      </div>
    </SectionGuard>
  );
}
