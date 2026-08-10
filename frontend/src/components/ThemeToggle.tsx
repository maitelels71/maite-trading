"use client";

import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/lib/theme";

const OPTIONS: ThemeMode[] = ["light", "dark"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div
      className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
      role="group"
      aria-label="Theme"
    >
      {OPTIONS.map((id) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "text-[var(--foreground)] hover:bg-[var(--hover)]"
            }`}
          >
            {t(`theme.${id}`)}
          </button>
        );
      })}
    </div>
  );
}
