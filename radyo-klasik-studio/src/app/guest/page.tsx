"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";
import Logo from "@/components/Logo";

// Guest DJ invite landing: /panel/guest#<token>. The token lives in the URL fragment
// so it never reaches server logs or Referer headers.
export default function GuestPage() {
  const { loginWithToken, ready } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const token = window.location.hash.replace(/^#/, "");
    if (!token) {
      setError("This invite link is incomplete.");
      return;
    }
    try {
      loginWithToken(token);
      window.history.replaceState(null, "", `${BASE_PATH}/guest`);
      router.replace("/studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid invite link");
    }
  }, [ready, loginWithToken, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm space-y-2 text-center">
        <div className="flex justify-center">
          <Logo className="h-12" />
        </div>
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error} Ask the station for a new link.
          </p>
        ) : (
          <p className="text-sm text-slate-400">Opening the studio…</p>
        )}
      </div>
    </div>
  );
}
