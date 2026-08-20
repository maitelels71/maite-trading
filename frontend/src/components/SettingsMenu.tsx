"use client";

import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Locale } from "@/lib/i18n";
import type { ThemeMode } from "@/lib/theme";

type SettingsMenuProps = {
  onAdmin: () => void;
  onAbout: () => void;
  adminActive?: boolean;
  adminHref?: string;
};

function sameTabNav(e: ReactMouseEvent, go: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
    return;
  }
  e.preventDefault();
  go();
}

export function SettingsMenu({
  onAdmin,
  onAbout,
  adminActive = false,
  adminHref = "/desk/?view=admin",
}: SettingsMenuProps) {
  const { t, locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickTheme(next: ThemeMode) {
    setTheme(next);
  }

  function pickLocale(next: Locale) {
    setLocale(next);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
          open || adminActive
            ? "bg-[var(--accent)] text-[var(--on-accent)]"
            : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        }`}
      >
        {t("nav.settings")}
        <span className="text-[10px] opacity-80" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("nav.settings")}
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] py-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t("settings.theme")}
            </p>
            <div className="flex gap-1 rounded-md bg-[var(--surface-muted)] p-0.5">
              {(["light", "dark"] as ThemeMode[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === id}
                  onClick={() => pickTheme(id)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition ${
                    theme === id
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "text-[var(--foreground)] hover:bg-[var(--hover)]"
                  }`}
                >
                  {t(`theme.${id}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t("settings.language")}
            </p>
            <div className="flex gap-1 rounded-md bg-[var(--surface-muted)] p-0.5">
              {(["en", "es"] as Locale[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === id}
                  onClick={() => pickLocale(id)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition ${
                    locale === id
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "text-[var(--foreground)] hover:bg-[var(--hover)]"
                  }`}
                >
                  {t(`lang.${id}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="my-1 border-t border-[var(--border)]" />

          <a
            href={adminHref}
            role="menuitem"
            onClick={(e) =>
              sameTabNav(e, () => {
                setOpen(false);
                onAdmin();
              })
            }
            className={`flex w-full items-center px-3 py-2 text-left text-sm font-medium transition hover:bg-[var(--hover)] ${
              adminActive
                ? "text-[var(--accent-fg)]"
                : "text-[var(--foreground)]"
            }`}
          >
            {t("nav.admin")}
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAbout();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--hover)]"
          >
            {t("nav.about")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
