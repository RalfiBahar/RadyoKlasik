"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import AnalyticsCharts from "@/components/AnalyticsCharts";

export default function AnalyticsPage() {
  return (
    <SectionGuard section="analytics">
      <PageHeader title="Analytics" subtitle="Listeners, sessions & reports" />
      <AnalyticsCharts />
    </SectionGuard>
  );
}
