"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import DashboardStats from "@/components/DashboardStats";

export default function DashboardPage() {
  return (
    <SectionGuard section="dashboard">
      <PageHeader
        title="Dashboard"
        subtitle="Station overview & broadcast settings"
      />
      <DashboardStats />
    </SectionGuard>
  );
}
