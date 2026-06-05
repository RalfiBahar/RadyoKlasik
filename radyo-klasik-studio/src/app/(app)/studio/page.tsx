"use client";

import { SectionGuard } from "@/components/AppShell";
import StudioConsole from "@/components/studio/StudioConsole";

export default function StudioPage() {
  return (
    <SectionGuard section="studio">
      <StudioConsole />
    </SectionGuard>
  );
}
