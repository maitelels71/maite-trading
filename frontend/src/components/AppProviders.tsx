"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>{children}</LocaleProvider>
    </ThemeProvider>
  );
}
