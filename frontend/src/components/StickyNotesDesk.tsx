"use client";

import { useEffect, useMemo, useState } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useDeskMode } from "@/components/DeskModeProvider";
import { useLocale } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import {
  localizedPlaybookLabel,
  localizedPlaybookName,
} from "@/lib/playbook-localize";
import type { StrategyPlaybook } from "@/lib/playbook-types";
import { playbooksForVenue } from "@/lib/playbooks";
import {
  boardsForVenue,
  playbookFamily,
  type StickyBoardDef,
  type StickyNoteCard,
} from "@/lib/sticky-boards";

const OPEN_STORAGE_KEY = "maite.sticky.boards.open";

function sideBias(markets: string): "CALL" | "PUT" | "CALL/PUT" {
  const m = markets.toUpperCase();
  const hasCall = m.includes("CALL");
  const hasPut = m.includes("PUT");
  if (hasCall && hasPut) return "CALL/PUT";
  if (hasPut) return "PUT";
  return "CALL";
}

function defaultOpenMap(boards: StickyBoardDef[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const b of boards) map[b.id] = Boolean(b.defaultOpen);
  return map;
}

function loadOpenMap(boards: StickyBoardDef[]): Record<string, boolean> {
  const defaults = defaultOpenMap(boards);
  try {
    const raw = localStorage.getItem(OPEN_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

type ZoomTarget =
  | { kind: "playbook"; playbook: StrategyPlaybook }
  | { kind: "note"; note: StickyNoteCard };

export function StickyNotesDesk() {
  const { t, locale } = useLocale();
  const { venue } = useDeskMode();
  const books = useMemo(
    () => playbooksForVenue(venue).filter((p) => Boolean(p.setupImage)),
    [venue],
  );
  const boardDefs = useMemo(() => boardsForVenue(venue), [venue]);

  const boards = useMemo(() => {
    return boardDefs
      .map((def) => {
        if (def.kind === "playbooks") {
          const items = books.filter(
            (p) => playbookFamily(p) === def.family,
          );
          return { def, playbooks: items, notes: [] as StickyNoteCard[] };
        }
        return {
          def,
          playbooks: [] as StrategyPlaybook[],
          notes: def.notes ?? [],
        };
      })
      .filter(({ def, playbooks, notes }) => {
        const count =
          def.kind === "playbooks" ? playbooks.length : notes.length;
        const hide = def.hideWhenEmpty ?? def.kind === "notes";
        return !(hide && count === 0);
      });
  }, [boardDefs, books]);

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    defaultOpenMap(boardDefs),
  );
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);

  useEffect(() => {
    setOpenMap(loadOpenMap(boardDefs));
  }, [boardDefs]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(openMap));
    } catch {
      /* ignore */
    }
  }, [openMap]);

  function setBoardOpen(id: string, open: boolean) {
    setOpenMap((prev) => ({ ...prev, [id]: open }));
  }

  return (
    <DeskStack>
      {boards.map(({ def, playbooks, notes }) => {
        const count =
          def.kind === "playbooks" ? playbooks.length : notes.length;
        const isOpen = openMap[def.id] ?? Boolean(def.defaultOpen);
        return (
          <DeskSession
            key={def.id}
            title={t(def.titleKey)}
            hint={t(def.hintKey)}
            panel={false}
            collapsible
            open={isOpen}
            onOpenChange={(next) => setBoardOpen(def.id, next)}
            badge={
              <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
                {count}
              </span>
            }
          >
            {count === 0 ? (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--muted)]">
                {t("sticky.empty")}
              </p>
            ) : def.kind === "playbooks" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {playbooks.map((pb) => (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    locale={locale}
                    onOpen={() =>
                      setZoom({ kind: "playbook", playbook: pb })
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={() => setZoom({ kind: "note", note })}
                  />
                ))}
              </div>
            )}
          </DeskSession>
        );
      })}

      {boards.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-sm text-[var(--muted)]">
          {t("sticky.empty")}
        </p>
      ) : null}

      {zoom ? (
        <ZoomDialog zoom={zoom} locale={locale} t={t} onClose={() => setZoom(null)} />
      ) : null}
    </DeskStack>
  );
}

function PlaybookCard({
  playbook: pb,
  locale,
  onOpen,
}: {
  playbook: StrategyPlaybook;
  locale: Locale;
  onOpen: () => void;
}) {
  const side = sideBias(pb.markets);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            <span className="text-[var(--accent)]">{pb.shortName}</span>
            <span className="text-[var(--muted)]"> · </span>
            {localizedPlaybookName(pb, locale)}
          </p>
          <p className="truncate text-[11px] text-[var(--muted)]">
            {pb.sessionWindow}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            side === "PUT"
              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
              : side === "CALL"
                ? "bg-[var(--ok-soft)] text-[var(--ok)]"
                : "bg-[var(--surface-muted)] text-[var(--muted)]"
          }`}
        >
          {side}
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pb.setupImage!}
        alt={localizedPlaybookLabel(pb, locale)}
        className="aspect-[4/3] w-full bg-[var(--surface-muted)] object-cover object-top"
      />
      <p className="line-clamp-2 px-3 py-2 text-[11px] leading-snug text-[var(--muted)]">
        {pb.summary}
      </p>
    </button>
  );
}

function NoteCard({
  note,
  onOpen,
}: {
  note: StickyNoteCard;
  onOpen: () => void;
}) {
  const hasBullets = Boolean(note.bullets?.length);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-left shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"
    >
      <div className="border-b border-[var(--border)] px-3 py-2">
        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
          {note.title}
        </p>
        {note.summary ? (
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
            {note.summary}
          </p>
        ) : null}
      </div>
      {note.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.image}
          alt={note.title}
          className="aspect-[4/3] w-full bg-[var(--surface-muted)] object-cover object-top"
        />
      ) : hasBullets ? (
        <ul className="max-h-56 space-y-1 overflow-hidden px-3 py-2">
          {note.bullets!.slice(0, 8).map((b) => (
            <li
              key={b}
              className="truncate text-[11px] leading-snug text-[var(--foreground)]"
            >
              <span className="text-[var(--accent)]">·</span> {b}
            </li>
          ))}
          {note.bullets!.length > 8 ? (
            <li className="text-[10px] text-[var(--muted)]">
              +{note.bullets!.length - 8} more · tap to open
            </li>
          ) : null}
        </ul>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-muted)] px-3 text-center text-xs text-[var(--muted)]">
          {note.summary ?? note.title}
        </div>
      )}
    </button>
  );
}

function ZoomDialog({
  zoom,
  locale,
  t,
  onClose,
}: {
  zoom: ZoomTarget;
  locale: Locale;
  t: (key: string) => string;
  onClose: () => void;
}) {
  const title =
    zoom.kind === "playbook"
      ? localizedPlaybookLabel(zoom.playbook, locale)
      : zoom.note.title;
  const image =
    zoom.kind === "playbook"
      ? zoom.playbook.setupImage
      : zoom.note.image;
  const summary =
    zoom.kind === "playbook" ? zoom.playbook.summary : zoom.note.summary;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            {zoom.kind === "playbook" ? (
              <>
                <h3 className="text-base font-semibold">
                  <span className="text-[var(--accent)]">
                    {zoom.playbook.shortName}
                  </span>
                  <span className="text-[var(--muted)]"> · </span>
                  {localizedPlaybookName(zoom.playbook, locale)}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {zoom.playbook.markets} · {zoom.playbook.sessionWindow}
                </p>
              </>
            ) : (
              <h3 className="text-base font-semibold">{zoom.note.title}</h3>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
          >
            {t("sticky.close")}
          </button>
        </header>
        <div className="overflow-auto">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={title}
              className="h-auto w-full bg-[var(--surface-muted)] object-contain"
            />
          ) : null}
          <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
            {summary ? (
              <p className="text-sm leading-snug text-[var(--foreground)]">
                {summary}
              </p>
            ) : null}
            {zoom.kind === "playbook" ? (
              <ol className="space-y-1.5">
                {zoom.playbook.entrySteps.slice(0, 6).map((step, i) => (
                  <li
                    key={step.id}
                    className="flex gap-2 text-xs leading-snug text-[var(--muted)]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--ok-soft)] text-[10px] font-bold text-[var(--ok)]">
                      {i + 1}
                    </span>
                    <span>
                      <span className="font-medium text-[var(--foreground)]">
                        {step.label}
                      </span>
                      {step.detail ? ` — ${step.detail}` : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : zoom.note.bullets?.length ? (
              <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
                {zoom.note.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
