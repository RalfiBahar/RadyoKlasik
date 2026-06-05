"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import LibraryView from "@/components/library/LibraryView";

export default function LibraryPage() {
  return (
    <SectionGuard section="library">
      <PageHeader title="Media Library" subtitle="Songs, jingles & commercials" />
      <LibraryView />
    </SectionGuard>
  );
}
