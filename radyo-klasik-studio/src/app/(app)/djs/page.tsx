"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionGuard } from "@/components/AppShell";
import { ErrorText, PageHeader, Spinner } from "@/components/ui";
import UsersPanel from "@/components/djs/UsersPanel";
import ShowsPanel from "@/components/djs/ShowsPanel";
import GuestsPanel from "@/components/djs/GuestsPanel";
import { listPlaylists, listShows, listUsers } from "@/lib/api";
import type { Playlist, Show, StaffUser } from "@/lib/types";

export default function DjsPage() {
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, s, p] = await Promise.all([listUsers(), listShows(), listPlaylists()]);
      setUsers(u.items);
      setShows(s.items);
      setPlaylists(p.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SectionGuard section="djs">
      <PageHeader title="DJ Management" subtitle="Accounts, shows & guest access" />
      <div className="space-y-4 p-6">
        <ErrorText>{error}</ErrorText>
        {users == null ? (
          !error && <Spinner label="Loading…" />
        ) : (
          <>
            <UsersPanel users={users} onChanged={load} />
            <ShowsPanel shows={shows} users={users} playlists={playlists} onChanged={load} />
            <GuestsPanel users={users} onChanged={load} />
          </>
        )}
      </div>
    </SectionGuard>
  );
}
