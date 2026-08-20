"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";

import {
  APP_MODE,
  labelForMode,
  parseAppMode,
  venueForMode,
  type AppMode,
} from "@/lib/app-mode";
import type { Venue } from "@/lib/types";

const DESK_MODE_KEY = "maite.desk.mode";

type DeskModeValue = {
  mode: AppMode;
  venue: Venue;
  label: string;
};

const DeskModeContext = createContext<DeskModeValue | null>(null);

export function DeskModeProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AppMode>(() => {
    if (typeof window === "undefined") return APP_MODE;
    const fromQuery = parseAppMode(
      new URLSearchParams(window.location.search).get("mode"),
    );
    if (fromQuery) return fromQuery;
    return parseAppMode(window.localStorage.getItem(DESK_MODE_KEY)) ?? APP_MODE;
  });

  useEffect(() => {
    const fromQuery = parseAppMode(searchParams.get("mode"));
    if (fromQuery) {
      window.localStorage.setItem(DESK_MODE_KEY, fromQuery);
      setMode(fromQuery);
      return;
    }
    const stored = parseAppMode(window.localStorage.getItem(DESK_MODE_KEY));
    setMode(stored ?? APP_MODE);
  }, [searchParams]);

  const value = useMemo<DeskModeValue>(
    () => ({
      mode,
      venue: venueForMode(mode),
      label: labelForMode(mode),
    }),
    [mode],
  );

  return (
    <DeskModeContext.Provider value={value}>{children}</DeskModeContext.Provider>
  );
}

export function useDeskMode(): DeskModeValue {
  const ctx = useContext(DeskModeContext);
  if (!ctx) {
    return {
      mode: APP_MODE,
      venue: venueForMode(APP_MODE),
      label: labelForMode(APP_MODE),
    };
  }
  return ctx;
}
