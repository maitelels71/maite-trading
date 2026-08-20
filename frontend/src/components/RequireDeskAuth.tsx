"use client";

import { useEffect, useState } from "react";

import { absorbDeskTokenFromLocation } from "@/lib/desk-session";

export function RequireDeskAuth({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = absorbDeskTokenFromLocation();
    if (!token) {
      const next = `${window.location.pathname}${window.location.search}`;
      // Drop any leftover ds= from the bounced URL before encoding next.
      let cleanNext = next;
      try {
        const u = new URL(next, window.location.origin);
        u.searchParams.delete("ds");
        cleanNext = `${u.pathname}${u.search}`;
      } catch {
        /* keep next */
      }
      const qs =
        cleanNext && cleanNext !== "/"
          ? `?next=${encodeURIComponent(cleanNext)}`
          : "";
      // Hard navigation — App Router soft replace is flaky on static export.
      window.location.replace(`/${qs}`);
      return;
    }
    setOk(true);
  }, []);

  if (!ok) return null;
  return <>{children}</>;
}
