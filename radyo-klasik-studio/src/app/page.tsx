"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { defaultSectionFor } from "@/lib/permissions";

// Root: bounce to the role's landing section, or to login.
export default function Home() {
  const { ready, isAuthenticated, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (isAuthenticated) {
      router.replace(`/${defaultSectionFor(role)}`);
    } else {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, role, router]);

  return (
    <div className="flex h-screen items-center justify-center text-slate-400">
      Loading…
    </div>
  );
}
