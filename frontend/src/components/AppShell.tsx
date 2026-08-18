"use client";

import { Suspense, useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AboutDialog } from "@/components/AboutDialog";
import { AdminDesk } from "@/components/AdminDesk";
import { DailyReview } from "@/components/DailyReview";
import { Dashboard } from "@/components/Dashboard";
import { JournalDesk } from "@/components/JournalDesk";
import { LocaleProvider, useLocale } from "@/components/LocaleProvider";
import { MindDesk } from "@/components/MindDesk";
import { NewsDesk } from "@/components/NewsDesk";
import { OptionsChecklistDesk } from "@/components/OptionsChecklistDesk";
import { PositionsDesk } from "@/components/PositionsDesk";
import { SettingsMenu } from "@/components/SettingsMenu";
import { StickyNotesDesk } from "@/components/StickyNotesDesk";
import { StrategiesDesk } from "@/components/StrategiesDesk";
import { ThemeProvider } from "@/components/ThemeProvider";
import {
  APP_DOCUMENT_TITLE,
  APP_ICON_SVG,
  APP_MODE,
  APP_MODE_LABEL,
  APP_VENUE,
} from "@/lib/app-mode";
import { DESK_VERSION } from "@/lib/desk-version";

type AppView =
  | "analyzer"
  | "strategies"
  | "daily"
  | "journal"
  | "mind"
  | "stickyNotes"
  | "optionsChecklist"
  | "positions"
  | "news"
  | "admin";

const APP_VIEWS = new Set<string>([
  "analyzer",
  "strategies",
  "daily",
  "journal",
  "mind",
  "stickyNotes",
  "optionsChecklist",
  "positions",
  "news",
  "admin",
]);

function isAppView(value: string | null | undefined): value is AppView {
  return Boolean(value && APP_VIEWS.has(value));
}

function viewHref(view: AppView): string {
  return `/?view=${view}`;
}

/** Same-tab SPA nav; Ctrl/Cmd/middle-click keep native new-tab behavior. */
function sameTabNav(e: MouseEvent, go: () => void) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
    return;
  }
  e.preventDefault();
  go();
}

type StepItem = {
  kind: "step";
  step: number;
  id: AppView;
  labelKey: string;
};

type ExtraItem = {
  kind: "extra";
  id: AppView;
  labelKey: string;
};

/** Live trading flow — primary header (action path during the session). */
const FLOW: StepItem[] = [
  { kind: "step", step: 1, id: "strategies", labelKey: "nav.strategies" },
  ...(APP_MODE === "options"
    ? ([{ kind: "step", step: 2, id: "positions", labelKey: "nav.positions" }] as StepItem[])
    : []),
  {
    kind: "step",
    step: APP_MODE === "options" ? 3 : 2,
    id: "analyzer",
    labelKey: "nav.analyzer",
  },
  {
    kind: "step",
    step: APP_MODE === "options" ? 4 : 3,
    id: "journal",
    labelKey: "nav.journal",
  },
];

/** Prep / reference — quieter second row (not in the live click path). */
const DESK_TOOLS: ExtraItem[] = [
  { kind: "extra", id: "daily", labelKey: "nav.daily" },
  { kind: "extra", id: "news", labelKey: "nav.news" },
  { kind: "extra", id: "stickyNotes", labelKey: "nav.stickyNotes" },
  ...(APP_MODE === "options"
    ? ([
        {
          kind: "extra",
          id: "optionsChecklist",
          labelKey: "nav.optionsChecklist",
        },
      ] as ExtraItem[])
    : []),
  { kind: "extra", id: "mind", labelKey: "nav.mind" },
];

function AppShellInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramView = searchParams.get("view");
  const [view, setViewState] = useState<AppView>(() =>
    isAppView(paramView) ? paramView : "strategies",
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const { t } = useLocale();

  useEffect(() => {
    if (isAppView(paramView) && paramView !== view) {
      setViewState(paramView);
    }
  }, [paramView, view]);

  const setView = useCallback(
    (next: AppView) => {
      setViewState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const toolActive = DESK_TOOLS.some((item) => item.id === view);

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:px-6">
          <a
            href={viewHref("strategies")}
            onClick={(e) => sameTabNav(e, () => setView("strategies"))}
            className="group mr-1 flex min-w-0 items-center gap-3 rounded-lg py-1 pr-2 text-left transition hover:bg-[var(--hover)]"
            aria-label={APP_DOCUMENT_TITLE}
          >
            <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-[var(--border)] shadow-sm bg-[#1c1917]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={APP_ICON_SVG}
                alt=""
                className="h-full w-full object-contain"
              />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)] sm:text-[14px]">
                Trading Like a Boss
              </span>
              <span className="mt-0.5 inline-flex h-5 min-w-[4.75rem] items-center justify-center rounded bg-[var(--accent)] px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--on-accent)]">
                {APP_MODE_LABEL}
              </span>
            </span>
          </a>

          <nav
            className="flex min-w-0 w-full flex-wrap items-center gap-1 sm:w-auto sm:flex-1"
            aria-label="Trading flow"
          >
            {FLOW.map((item, index) => {
              const active = view === item.id;
              const showArrow = index < FLOW.length - 1;
              return (
                <div key={item.id} className="flex items-center gap-1">
                  <StepLink
                    step={item.step}
                    label={t(item.labelKey)}
                    active={active}
                    href={viewHref(item.id)}
                    onNavigate={() => setView(item.id)}
                  />
                  {showArrow ? (
                    <span
                      className="hidden text-[var(--muted)] sm:inline"
                      aria-hidden
                    >
                      →
                    </span>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>

        <div
          className={`border-t border-[var(--border)] ${
            toolActive ? "bg-[var(--surface-muted)]/60" : "bg-[var(--surface)]"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-1.5 sm:px-6">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {t("nav.deskTools")}
            </span>
            <nav
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              aria-label={t("nav.deskTools")}
            >
              {DESK_TOOLS.map((item) => {
                const active = view === item.id;
                return (
                  <a
                    key={item.id}
                    href={viewHref(item.id)}
                    onClick={(e) => sameTabNav(e, () => setView(item.id))}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {t(item.labelKey)}
                  </a>
                );
              })}
            </nav>
            <span
              className="tabular-nums text-[10px] font-semibold text-[var(--muted)]"
              title={DESK_VERSION}
            >
              {DESK_VERSION}
            </span>
            <SettingsMenu
              adminActive={view === "admin"}
              adminHref={viewHref("admin")}
              onAdmin={() => setView("admin")}
              onAbout={() => setAboutOpen(true)}
            />
          </div>
        </div>
      </header>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {view === "daily" ? (
        <DailyReview />
      ) : view === "journal" ? (
        <JournalDesk />
      ) : view === "mind" ? (
        <MindDesk />
      ) : view === "stickyNotes" ? (
        <StickyNotesDesk />
      ) : view === "optionsChecklist" ? (
        <OptionsChecklistDesk />
      ) : view === "positions" ? (
        <PositionsDesk />
      ) : view === "strategies" ? (
        <StrategiesDesk venue={APP_VENUE} />
      ) : view === "analyzer" ? (
        <Dashboard />
      ) : view === "news" ? (
        <NewsDesk />
      ) : (
        <AdminDesk />
      )}
    </div>
  );
}

function StepLink({
  step,
  label,
  active,
  href,
  onNavigate,
}: {
  step: number;
  label: string;
  active: boolean;
  href: string;
  onNavigate: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(e) => sameTabNav(e, onNavigate)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-sm"
          : "text-[var(--foreground)] hover:bg-[var(--hover)] hover:text-[var(--accent-fg)]"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
          active
            ? "bg-white/25 text-[var(--on-accent)]"
            : "bg-[var(--border-strong)] text-[var(--foreground)]"
        }`}
      >
        {step}
      </span>
      {label}
    </a>
  );
}

export function AppShell() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <Suspense fallback={null}>
          <AppShellInner />
        </Suspense>
      </LocaleProvider>
    </ThemeProvider>
  );
}
