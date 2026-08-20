"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { absorbDeskTokenFromLocation } from "@/lib/desk-session";

export function RequireDeskAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const token = absorbDeskTokenFromLocation();
    if (!token) {
      const next = `${window.location.pathname}${window.location.search}`;
      const qs = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
      router.replace(`/${qs}`);
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
