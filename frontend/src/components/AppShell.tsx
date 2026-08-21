"use client";

import { Suspense, useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AboutDialog } from "@/components/AboutDialog";
import { AdminDesk } from "@/components/AdminDesk";
import { DailyReview } from "@/components/DailyReview";
import { Dashboard } from "@/components/Dashboard";
import { DeskModeProvider, useDeskMode } from "@/components/DeskModeProvider";
import { CandlesMark, FuturesMark } from "@/components/HubDeskIcons";
import { JournalDesk } from "@/components/JournalDesk";
import { JobsDesk } from "@/components/JobsDesk";
import { useLocale } from "@/components/LocaleProvider";
import { MindDesk } from "@/components/MindDesk";
import { NewsDesk } from "@/components/NewsDesk";
import { OptionsChecklistDesk } from "@/components/OptionsChecklistDesk";
import { PositionsDesk } from "@/components/PositionsDesk";
import { SettingsMenu } from "@/components/SettingsMenu";
import { StickyNotesDesk } from "@/components/StickyNotesDesk";
import { StrategiesDesk } from "@/components/StrategiesDesk";
import { APP_DOCUMENT_TITLE, deskViewHref, type AppMode } from "@/lib/app-mode";
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
  | "jobs"
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
  "jobs",
  "admin",
]);

function isAppView(value: string | null | undefined): value is AppView {
  return Boolean(value && APP_VIEWS.has(value));
}

function viewHref(view: AppView, mode: AppMode): string {
  return deskViewHref(view, mode);
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

function flowForMode(mode: AppMode): StepItem[] {
  const options = mode === "options";
  return [
    { kind: "step", step: 1, id: "strategies", labelKey: "nav.strategies" },
    ...(options
      ? ([{ kind: "step", step: 2, id: "positions", labelKey: "nav.positions" }] as StepItem[])
      : []),
    {
      kind: "step",
      step: options ? 3 : 2,
      id: "analyzer",
      labelKey: "nav.analyzer",
    },
    {
      kind: "step",
      step: options ? 4 : 3,
      id: "journal",
      labelKey: "nav.journal",
    },
  ];
}

function toolsForMode(mode: AppMode): ExtraItem[] {
  return [
    { kind: "extra", id: "daily", labelKey: "nav.daily" },
    { kind: "extra", id: "news", labelKey: "nav.news" },
    { kind: "extra", id: "stickyNotes", labelKey: "nav.stickyNotes" },
    ...(mode === "options"
      ? ([
          {
            kind: "extra",
            id: "optionsChecklist",
            labelKey: "nav.optionsChecklist",
          },
        ] as ExtraItem[])
      : []),
    { kind: "extra", id: "mind", labelKey: "nav.mind" },
    { kind: "extra", id: "jobs", labelKey: "nav.jobs" },
  ];
}

function AppShellInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mode, venue, label } = useDeskMode();
  const FLOW = flowForMode(mode);
  const DESK_TOOLS = toolsForMode(mode);
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

  useEffect(() => {
    if (mode === "futures" && (view === "positions" || view === "optionsChecklist")) {
      setViewState("strategies");
    }
  }, [mode, view]);

  const setView = useCallback(
    (next: AppView) => {
      setViewState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      params.set("mode", mode);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [mode, pathname, router, searchParams],
  );

  const toolActive = DESK_TOOLS.some((item) => item.id === view);

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6">
          <a
            href={viewHref("strategies", mode)}
            onClick={(e) => sameTabNav(e, () => setView("strategies"))}
            className="flex shrink-0 items-center gap-2 rounded-lg py-0.5 pr-1 text-left transition hover:bg-[var(--hover)]"
            aria-label={APP_DOCUMENT_TITLE}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md">
              {venue === "tradeadvocate" ? (
                <FuturesMark className="h-9 w-9" />
              ) : (
                <CandlesMark className="h-9 w-9" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight sm:text-base">
                {APP_DOCUMENT_TITLE}
              </span>
              <span className="mt-0.5 inline-flex h-5 items-center rounded bg-[var(--accent)] px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--on-accent)]">
                {label}
              </span>
            </span>
          </a>

          <nav
            className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5"
            aria-label="Trading flow"
          >
            {FLOW.map((item) => {
              const active = view === item.id;
              return (
                <StepLink
                  key={item.id}
                  step={item.step}
                  label={t(item.labelKey)}
                  active={active}
                  href={viewHref(item.id, mode)}
                  onNavigate={() => setView(item.id)}
                />
              );
            })}
          </nav>

          <a
            href="/"
            className="inline-flex shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-bold text-[var(--foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--on-accent)] hover:border-[var(--accent)]"
          >
            ← {t("hub.homeBack")}
          </a>
          <span
            className="shrink-0 tabular-nums text-[10px] font-semibold text-[var(--muted)]"
            title={DESK_VERSION}
          >
            {DESK_VERSION}
          </span>
          <SettingsMenu
            adminActive={view === "admin"}
            adminHref={viewHref("admin", mode)}
            onAdmin={() => setView("admin")}
            onAbout={() => setAboutOpen(true)}
          />
        </div>

        <div
          className={`border-t border-[var(--border)] ${
            toolActive ? "bg-[var(--surface-muted)]/60" : "bg-[var(--surface)]"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-1.5 sm:px-6">
            <span className="sr-only">{t("nav.deskTools")}</span>
            <nav
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
              aria-label={t("nav.deskTools")}
            >
              {DESK_TOOLS.map((item) => {
                const active = view === item.id;
                return (
                  <a
                    key={item.id}
                    href={viewHref(item.id, mode)}
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
        <StrategiesDesk
          venue={venue}
          autoScan={mode !== "options" && searchParams.get("scan") === "1"}
        />
      ) : view === "analyzer" ? (
        <Dashboard />
      ) : view === "news" ? (
        <NewsDesk />
      ) : view === "jobs" ? (
        <JobsDesk />
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
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
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
    <Suspense fallback={null}>
      <DeskModeProvider>
        <AppShellInner />
      </DeskModeProvider>
    </Suspense>
  );
}
