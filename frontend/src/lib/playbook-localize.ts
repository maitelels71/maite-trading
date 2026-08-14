/** Resolve playbook copy for the active UI locale. */

import type { Locale } from "@/lib/i18n";
import type {
  PlaybookStep,
  PlaybookTimeframe,
  StrategyPlaybook,
} from "@/lib/playbook-types";
import { PLAYBOOK_EN } from "@/lib/playbooks-en-overlay";

/** Playbook with plain strings for the active locale. */
export type LocalizedPlaybook = StrategyPlaybook;

function mergeSteps(
  base: PlaybookStep[],
  overlay?: PlaybookStep[],
): PlaybookStep[] {
  if (!overlay?.length) return base;
  const byId = new Map(overlay.map((s) => [s.id, s]));
  return base.map((s) => {
    const o = byId.get(s.id);
    if (!o) return s;
    return {
      id: s.id,
      label: o.label,
      detail: o.detail ?? s.detail,
    };
  });
}

function mergeByTf(
  base: PlaybookTimeframe[],
  overlay?: PlaybookTimeframe[],
): PlaybookTimeframe[] {
  if (!overlay?.length) return base;
  const byTf = new Map(overlay.map((t) => [t.timeframe, t]));
  return base.map((t) => {
    const o = byTf.get(t.timeframe);
    if (!o) return t;
    return {
      timeframe: t.timeframe,
      focus: o.focus || t.focus,
      steps: mergeSteps(t.steps, o.steps),
    };
  });
}

/**
 * Spanish source lives in playbook files.
 * English comes from PLAYBOOK_EN overlays (same step ids).
 */
export function localizePlaybook(
  playbook: StrategyPlaybook,
  locale: Locale,
): LocalizedPlaybook {
  if (locale === "es") return playbook;

  const en = PLAYBOOK_EN[playbook.id];
  if (!en) return playbook;

  return {
    ...playbook,
    name: en.name ?? playbook.name,
    summary: en.summary ?? playbook.summary,
    markets: en.markets ?? playbook.markets,
    sessionWindow: en.sessionWindow ?? playbook.sessionWindow,
    riskNotes: en.riskNotes ?? playbook.riskNotes,
    invalidation: en.invalidation ?? playbook.invalidation,
    entrySteps: mergeSteps(playbook.entrySteps, en.entrySteps),
    exitSteps: mergeSteps(playbook.exitSteps, en.exitSteps),
    byTimeframe: mergeByTf(playbook.byTimeframe, en.byTimeframe),
  };
}

export function localizedPlaybookName(
  playbook: StrategyPlaybook,
  locale: Locale,
): string {
  const pb = localizePlaybook(playbook, locale);
  return pb.name.replace(/^[A-Z0-9]+\s*—\s*/, "");
}

/** Code + short title for dropdowns / tables (e.g. "E01 · Bollinger H trend flip"). */
export function localizedPlaybookLabel(
  playbook: StrategyPlaybook,
  locale: Locale,
): string {
  return `${playbook.shortName} · ${localizedPlaybookName(playbook, locale)}`;
}
