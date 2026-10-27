"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { canAccess, sectionsFor, type Section } from "@/lib/permissions";
import Logo from "@/components/Logo";

const NAV: { section: Section; href: string; label: string; icon: string }[] = [
  { section: "dashboard", href: "/dashboard", label: "Dashboard", icon: "◴" },
  { section: "studio", href: "/studio", label: "Virtual Studio", icon: "▣" },
  { section: "library", href: "/library", label: "Media Library", icon: "♫" },
  { section: "playlists", href: "/playlists", label: "Playlists", icon: "≣" },
  { section: "recordings", href: "/recordings", label: "Recordings", icon: "●" },
  { section: "chat", href: "/chat", label: "Listener chat", icon: "✉" },
  { section: "announcements", href: "/announcements", label: "Announcements", icon: "✦" },
  { section: "analytics", href: "/analytics", label: "Analytics", icon: "▤" },
  { section: "scheduling", href: "/scheduling", label: "Scheduling", icon: "▦" },
  { section: "djs", href: "/djs", label: "DJ Management", icon: "☺" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, role, name, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/login");
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const allowed = sectionsFor(role);
  const navItems = NAV.filter((n) => allowed.includes(n.section));

  const onLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-700 bg-ink-800">
        <div className="px-4 py-5">
          <Logo caption="Station panel" className="h-9" />
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.section}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-brand font-semibold text-white"
                    : "text-slate-300 hover:bg-ink-700"
                }`}
              >
                <span className="w-4 text-center" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-ink-700 p-3 text-xs text-slate-400">
          <div className="mb-2">
            Signed in as{" "}
            <span className="font-semibold text-slate-200">{name || "—"}</span>
            <span className="ml-1 uppercase text-slate-500">· {role}</span>
          </div>
          <button onClick={onLogout} className="btn-ghost w-full">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto scroll-thin">
        {children}
      </main>
    </div>
  );
}

// Per-page guard: redirect to login if not authed, or to the role landing if
// the role can't access this section.
export function SectionGuard({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { ready, isAuthenticated, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (!canAccess(role, section)) {
      const fallback = sectionsFor(role)[0] || "studio";
      router.replace(`/${fallback}`);
    }
  }, [ready, isAuthenticated, role, section, router]);

  if (!ready || !isAuthenticated || !canAccess(role, section)) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        {ready && isAuthenticated ? "Redirecting…" : "Loading…"}
      </div>
    );
  }
  return <>{children}</>;
}
