"use client";

import { SectionGuard } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import ChatFeed from "@/components/chat/ChatFeed";
import { clearChat } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ChatPage() {
  const { role, name } = useAuth();

  const clearAll = async () => {
    if (!window.confirm("Delete ALL chat messages? Listeners will see an empty chat.")) return;
    await clearChat();
    window.location.reload();
  };

  return (
    <SectionGuard section="chat">
      <PageHeader
        title="Listener chat"
        subtitle="The chat on the website and in the app — reply and moderate"
        actions={
          role === "admin" ? (
            <button className="btn-ghost text-red-300" onClick={clearAll}>
              Clear chat
            </button>
          ) : undefined
        }
      />
      <div className="p-6">
        <div className="card h-[calc(100vh-11rem)]">
          <ChatFeed senderDefault={role === "admin" ? "" : name || ""} />
        </div>
      </div>
    </SectionGuard>
  );
}
