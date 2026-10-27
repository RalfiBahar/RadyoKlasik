"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { deleteChat, listChat, postChat } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { ErrorText } from "@/components/ui";

// Listener chat (the website/app chat): live feed, reply as the station or DJ,
// delete messages. Used on the Listener chat page and inside the studio.
export default function ChatFeed({
  compact = false,
  senderDefault,
}: {
  compact?: boolean;
  senderDefault?: string;
}) {
  const [items, setItems] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sender, setSender] = useState(senderDefault || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await listChat();
      setItems(res.items);
    } catch {
      // best-effort; keep the last list
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // Follow new messages.
  useEffect(() => {
    if (items && items.length > lastCount.current) bottom.current?.scrollIntoView({ block: "end" });
    lastCount.current = items?.length || 0;
  }, [items]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await postChat(text.trim(), sender.trim() || undefined);
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const remove = async (m: ChatMessage) => {
    if (!window.confirm(`Delete this message from ${m.sender}?`)) return;
    try {
      await deleteChat(m.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className={`min-h-0 flex-1 space-y-2 overflow-y-auto scroll-thin ${compact ? "p-2" : "p-1"}`}>
        {items == null && <li className="text-sm text-slate-500">Loading…</li>}
        {items?.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No messages yet.</li>}
        {items?.map((m) => (
          <li
            key={m.id}
            className={`group rounded-md px-2 py-1.5 text-sm ${m.admin ? "bg-brand/10" : "bg-ink-900/40"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate font-semibold ${m.admin ? "text-brand" : "text-slate-200"}`}>
                {m.sender}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                {new Date(m.timestamp).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                <button
                  onClick={() => remove(m)}
                  className="text-slate-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                  aria-label={`Delete message from ${m.sender}`}
                >
                  ✕
                </button>
              </span>
            </div>
            <div className="whitespace-pre-wrap break-words text-slate-300">{m.message}</div>
          </li>
        ))}
        <div ref={bottom} />
      </ul>
      <form onSubmit={send} className={`space-y-2 border-t border-ink-700 ${compact ? "p-2" : "pt-3"}`}>
        {!compact && (
          <input
            className="input"
            placeholder="Reply as (default: your DJ name / station name)"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            aria-label="Reply as"
          />
        )}
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Reply to listeners…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            aria-label="Message"
          />
          <button className="btn-primary" disabled={sending || !text.trim()}>
            Send
          </button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </div>
  );
}
