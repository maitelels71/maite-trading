"use client";

import { useEffect, useState } from "react";

import { toStaticHtmlPath } from "@/lib/app-mode";
import { absorbDeskTokenFromLocation } from "@/lib/desk-session";

export function RequireDeskAuth({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = absorbDeskTokenFromLocation();
    if (!token) {
      const next = `${window.location.pathname}${window.location.search}`;
      let cleanNext = next;
      try {
        const u = new URL(next, window.location.origin);
        u.searchParams.delete("ds");
        cleanNext = toStaticHtmlPath(`${u.pathname}${u.search}`);
      } catch {
        cleanNext = toStaticHtmlPath(next);
      }
      const qs =
        cleanNext && cleanNext !== "/"
          ? `?next=${encodeURIComponent(cleanNext)}`
          : "";
      window.location.replace(`/${qs}`);
      return;
    }
    setOk(true);
  }, []);

  if (!ok) return null;
  return <>{children}</>;
}
