/**
 * Sticky Notes boards — data-driven sessions (playbook grids or study notes).
 * Add a board here; StickyNotesDesk renders it as a collapsible DeskSession.
 */

import type { StrategyPlaybook } from "@/lib/playbook-types";
import { stickyCardsFromRanges } from "@/lib/options-premium-ranges";
import type { Venue } from "@/lib/types";

export type StickyBoardKind = "playbooks" | "notes";

export type PlaybookFamily = "e" | "cr" | "ml" | "ch";

/** Free-form study / cheat-sheet card (not tied to a playbook). */
export type StickyNoteCard = {
  id: string;
  title: string;
  summary?: string;
  image?: string;
  /** Optional body lines (study bullets). */
  bullets?: string[];
};

export type StickyBoardDef = {
  id: string;
  /** i18n key for session title */
  titleKey: string;
  /** i18n key for session hint */
  hintKey: string;
  kind: StickyBoardKind;
  /** Only show on this venue; omit = both */
  venue?: Venue;
  /** Open on first visit (others start collapsed). */
  defaultOpen?: boolean;
  /** For kind=playbooks: which family to include */
  family?: PlaybookFamily;
  /** For kind=notes: static cards (estudio, etc.) */
  notes?: StickyNoteCard[];
  /** Hide board when it has no cards (default true for notes). */
  hideWhenEmpty?: boolean;
};

export const STICKY_BOARDS: StickyBoardDef[] = [
  {
    id: "cr",
    titleKey: "sticky.boardCr",
    hintKey: "sticky.boardCrHint",
    kind: "playbooks",
    venue: "schwab",
    family: "cr",
    defaultOpen: true,
  },
  {
    id: "e",
    titleKey: "sticky.boardE",
    hintKey: "sticky.boardEHint",
    kind: "playbooks",
    venue: "schwab",
    family: "e",
    defaultOpen: false,
  },
  {
    id: "ch",
    titleKey: "sticky.boardCh",
    hintKey: "sticky.boardChHint",
    kind: "playbooks",
    venue: "schwab",
    family: "ch",
    defaultOpen: true,
  },
  {
    id: "chFutures",
    titleKey: "sticky.boardCh",
    hintKey: "sticky.boardChHintFutures",
    kind: "playbooks",
    venue: "tradeadvocate",
    family: "ch",
    defaultOpen: true,
  },
  {
    id: "ml",
    titleKey: "sticky.boardMl",
    hintKey: "sticky.boardMlHint",
    kind: "playbooks",
    venue: "tradeadvocate",
    family: "ml",
    defaultOpen: true,
  },
  {
    id: "rango",
    titleKey: "sticky.boardRango",
    hintKey: "sticky.boardRangoHint",
    kind: "notes",
    venue: "schwab",
    defaultOpen: true,
    hideWhenEmpty: false,
    notes: stickyCardsFromRanges(),
  },
  {
    id: "study",
    titleKey: "sticky.boardStudy",
    hintKey: "sticky.boardStudyHint",
    kind: "notes",
    defaultOpen: false,
    hideWhenEmpty: true,
    notes: [
      // Add study cards here later, e.g.:
      // { id: "gaps", title: "Gaps", summary: "…", bullets: ["…"] },
    ],
  },
];

export function playbookFamily(p: StrategyPlaybook): PlaybookFamily | null {
  if (p.id.startsWith("ml") || p.group === "Maylels") return "ml";
  if (p.id.startsWith("cr") || p.group?.startsWith("Creando")) return "cr";
  if (p.id.startsWith("ch") || p.group?.startsWith("Channel")) return "ch";
  if (p.id.startsWith("e") || p.group?.startsWith("BB")) return "e";
  return null;
}

export function boardsForVenue(venue: Venue): StickyBoardDef[] {
  return STICKY_BOARDS.filter((b) => !b.venue || b.venue === venue);
}
