"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader, ComingSoon } from "@/components/ui";

export default function SchedulingPage() {
  return (
    <SectionGuard section="scheduling">
      <PageHeader title="Scheduling" subtitle="Shows, playlists & autopilot windows" />
      <div className="space-y-4 p-6">
        <ComingSoon feature="Drag-and-drop schedule calendar" phase="Phase 7" />
        <ComingSoon feature="Breaks & jingle automation" phase="Phase 7" />
      </div>
    </SectionGuard>
  );
}
