"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { useLocale } from "@/components/LocaleProvider";
import { APP_MODE } from "@/lib/app-mode";
import { ABOUT } from "@/lib/about";

type AboutDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const { t } = useLocale();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const modeLabel =
    APP_MODE === "futures" ? t("about.modeFutures") : t("about.modeOptions");

  const contactBits: { key: string; node: ReactNode }[] = [];
  if (ABOUT.phone) {
    contactBits.push({ key: "phone", node: ABOUT.phone });
  }
  if (ABOUT.websiteUrl && ABOUT.websiteLabel) {
    contactBits.push({
      key: "web",
      node: (
        <a
          href={ABOUT.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-fg)]"
        >
          {ABOUT.websiteLabel}
        </a>
      ),
    });
  }
  if (ABOUT.email) {
    contactBits.push({
      key: "email",
      node: (
        <a
          href={`mailto:${ABOUT.email}`}
          className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-fg)]"
        >
          {ABOUT.email}
        </a>
      ),
    });
  }
  if (ABOUT.privacyUrl && ABOUT.privacyLabel) {
    contactBits.push({
      key: "privacy",
      node: (
        <a
          href={ABOUT.privacyUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-fg)]"
        >
          {ABOUT.privacyLabel}
        </a>
      ),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <h2
            id={titleId}
            className="text-sm font-semibold text-[var(--foreground)]"
          >
            {t("about.title")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
            aria-label={t("about.close")}
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-[#c9893a]/55 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/charging-bull.png"
                alt=""
                className="h-full w-full object-cover object-[50%_35%]"
              />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold tracking-tight text-[var(--foreground)]">
                {ABOUT.productName}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {modeLabel}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm text-[var(--foreground)]">
            <p>
              {t("about.version")}: {ABOUT.version}
            </p>
            <p>
              ©{ABOUT.copyrightYear} {ABOUT.copyrightHolder}
            </p>
            <p className="leading-relaxed text-[var(--muted)]">
              {t("about.ownership")}
            </p>
          </div>

          {contactBits.length > 0 ? (
            <p className="text-sm text-[var(--foreground)]">
              {contactBits.map((bit, i) => (
                <span key={bit.key}>
                  {i > 0 ? (
                    <span className="text-[var(--muted)]"> · </span>
                  ) : null}
                  {bit.node}
                </span>
              ))}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-[var(--muted)]">
            {t("about.disclaimer")}
          </p>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-[var(--on-accent)] hover:opacity-95"
          >
            {t("about.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
