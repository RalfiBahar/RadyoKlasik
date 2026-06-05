"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader, ComingSoon } from "@/components/ui";

export default function LibraryPage() {
  return (
    <SectionGuard section="library">
      <PageHeader title="Media Library" subtitle="Songs, jingles & commercials" />
      <div className="p-6">
        <ComingSoon feature="Media library table & upload" phase="Phase 5 — Window B" />
      </div>
    </SectionGuard>
  );
}
