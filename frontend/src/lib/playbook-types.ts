/** Shared playbook types (no runtime imports). */

import type { Venue } from "@/lib/types";

export type PlaybookStep = {
  id: string;
  label: string;
  detail?: string;
};

export type PlaybookTimeframe = {
  timeframe: string;
  focus: string;
  steps: PlaybookStep[];
};

export type StrategyPlaybook = {
  id: string;
  /** Desk session: schwab = ETFs/Options · tradeadvocate = Futures */
  venue: Venue;
  /** Dropdown group label (e.g. "Maylels", "BB · E01–E04") */
  group?: string;
  /** Optional setup diagram under /public (e.g. /brand/ml01-mnq-setup.png) */
  setupImage?: string;
  /** Matches backend strategy registry name when scannable */
  strategyKey: string | null;
  /** Suggested scan TF (backend may also force via strategy.scan_timeframe) */
  preferredTimeframe?: string;
  /** Timeframes to pull from the broker before scan (Sync & Scan). */
  syncTimeframes?: string[];
  /** Calendar days before session_date to sync for indicator warm-up. */
  syncLookbackDays?: number;
  name: string;
  shortName: string;
  markets: string;
  summary: string;
  sessionWindow: string;
  riskNotes: string[];
  invalidation: string[];
  entrySteps: PlaybookStep[];
  exitSteps: PlaybookStep[];
  byTimeframe: PlaybookTimeframe[];
};
