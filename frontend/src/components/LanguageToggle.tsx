"use client";

import { useLocale } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";

const OPTIONS: Locale[] = ["en", "es"];

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] p-0.5"
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((id) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setLocale(id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            }`}
          >
            {t(`lang.${id}`)}
          </button>
        );
      })}
    </div>
  );
}
