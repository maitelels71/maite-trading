"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getDeskToken } from "@/lib/desk-session";

export function RequireDeskAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!getDeskToken()) {
      router.replace("/");
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
