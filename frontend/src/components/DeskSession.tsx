import type { ReactNode } from "react";

type DeskSessionProps = {
  /** Optional step number shown in the break label. */
  step?: number | string;
  title: string;
  hint?: string;
  children: ReactNode;
  /** Skip the top break line (first session on a page). */
  first?: boolean;
  /** Extra classes on the inner panel. */
  panelClassName?: string;
  /** When false, render children without the bordered panel. */
  panel?: boolean;
  /** Optional actions aligned to the right of the session title. */
  actions?: ReactNode;
  /** When set, title row toggles body visibility (multi-open OK). */
  collapsible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Badge next to title (e.g. card count). */
  badge?: ReactNode;
};

/**
 * Visual “session break” between desk blocks (TOP 5 vs Sync & Scan vs chart…).
 * Same pattern on Options + Futures pages.
 */
export function DeskSession({
  step,
  title,
  hint,
  children,
  first = false,
  panelClassName = "",
  panel = true,
  actions,
  collapsible = false,
  open = true,
  onOpenChange,
  badge,
}: DeskSessionProps) {
  const showBody = !collapsible || open;

  function toggle() {
    if (!collapsible || !onOpenChange) return;
    onOpenChange(!open);
  }

  return (
    <section className={first ? "space-y-3" : "mt-2 space-y-3 pt-1"}>
      {!first ? (
        <div
          className="flex items-center gap-3"
          role="separator"
          aria-hidden="true"
        >
          <div className="h-px flex-1 bg-[var(--border-strong)]" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {step != null ? `${step} · ` : ""}
            {title}
          </span>
          <div className="h-px flex-1 bg-[var(--border-strong)]" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {collapsible ? (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="inline-flex items-center gap-2 rounded-md text-left transition hover:bg-[var(--hover)]"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded bg-[var(--surface-muted)] text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)]"
                  aria-hidden
                >
                  {open ? "−" : "+"}
                </span>
                {step != null ? (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-[var(--surface-muted)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
                    {step}
                  </span>
                ) : null}
                <h3 className="text-sm font-semibold leading-tight text-[var(--foreground)]">
                  {title}
                </h3>
                {badge}
              </button>
            ) : (
              <>
                {step != null ? (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-[var(--surface-muted)] px-1.5 text-[10px] font-bold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
                    {step}
                  </span>
                ) : null}
                <h3 className="text-sm font-semibold leading-tight text-[var(--foreground)]">
                  {title}
                </h3>
                {badge}
              </>
            )}
          </div>
          {hint && showBody ? (
            <p className="mt-0.5 max-w-3xl text-[11px] text-[var(--muted)]">
              {hint}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {showBody ? (
        panel ? (
          <div
            className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ${panelClassName}`}
          >
            {children}
          </div>
        ) : (
          children
        )
      ) : null}
    </section>
  );
}

/** Page stack with consistent vertical rhythm between sessions. */
export function DeskStack({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-7xl space-y-4 px-4 py-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}
