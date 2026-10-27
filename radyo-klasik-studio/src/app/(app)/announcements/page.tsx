"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionGuard } from "@/components/AppShell";
import { Badge, ErrorText, Field, PageHeader } from "@/components/ui";
import {
  clearAnnouncement,
  getAnnouncement,
  getPushOverview,
  sendPush,
  setAnnouncement,
} from "@/lib/api";
import type { Announcement, PushOverview } from "@/lib/types";

export default function AnnouncementsPage() {
  return (
    <SectionGuard section="announcements">
      <PageHeader title="Announcements" subtitle="The banner on the website and app, and push notifications" />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <AnnouncementCard />
        <PushCard />
      </div>
    </SectionGuard>
  );
}

function AnnouncementCard() {
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnnouncement()
      .then((a) => {
        setCurrent(a);
        setText(a.text || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const a = text.trim() ? await setAnnouncement(text.trim()) : await clearAnnouncement();
      setCurrent(a);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-3">
      <div>
        <div className="text-sm font-semibold text-slate-100">Announcement</div>
        <div className="text-xs text-slate-500">
          Shown to everyone on the website and in the app. Leave empty and save to remove it.
        </div>
      </div>
      <textarea
        className="input min-h-[140px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Live concert this Sunday at 10:00!"
        aria-label="Announcement text"
      />
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={saving || text.trim() === (current?.text || "")}>
          {saving ? "Saving…" : !text.trim() && current?.text ? "Remove announcement" : "Publish"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        <span className="text-xs text-slate-500">
          {current?.text
            ? `Live since ${new Date(current.updatedAt as string).toLocaleString()}`
            : "No announcement is showing"}
        </span>
      </div>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

function PushCard() {
  const [overview, setOverview] = useState<PushOverview | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPushOverview()
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);
  useEffect(load, [load]);

  const send = async () => {
    const n = overview?.devices ?? 0;
    if (!window.confirm(`Send “${title}” to ${n} device${n === 1 ? "" : "s"} now? This can't be undone.`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await sendPush({ title: title.trim(), subtitle: subtitle.trim() || undefined, body: body.trim() });
      setResult(
        `Delivered to ${r.delivered} of ${r.attempted} devices` +
          (r.removedDevices ? ` (${r.removedDevices} uninstalled apps removed)` : "")
      );
      setTitle("");
      setSubtitle("");
      setBody("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Push notification</div>
          <div className="text-xs text-slate-500">Sent to everyone with the app and notifications on.</div>
        </div>
        <Badge tone="blue">{overview ? `${overview.devices} devices` : "…"}</Badge>
      </div>
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Subtitle (iOS, optional)">
        <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Message">
        <textarea className="input min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} />
      </Field>
      <button className="btn-primary" onClick={send} disabled={sending || !title.trim() || !body.trim()}>
        {sending ? "Sending…" : "Send notification"}
      </button>
      {result && <p className="text-sm text-emerald-400">{result}</p>}
      <ErrorText>{error}</ErrorText>

      {overview && overview.history.length > 0 && (
        <div className="border-t border-ink-700 pt-3">
          <div className="mb-2 text-xs font-medium uppercase text-slate-400">Recently sent</div>
          <ul className="space-y-2 text-sm">
            {overview.history.slice(0, 8).map((h) => (
              <li key={h.sentAt} className="flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium text-slate-200">{h.title}</span>
                  <span className="block truncate text-xs text-slate-500">{h.body}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500">
                  {new Date(h.sentAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  <br />
                  {h.delivered}/{h.attempted}
                  {h.sentBy ? ` · ${h.sentBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
