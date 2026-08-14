/** Bilingual string helpers for playbook / desk copy. */

import type { Locale } from "@/lib/i18n";

/** Plain string (legacy, treated as Spanish) or explicit EN/ES pair. */
export type LString = string | { en: string; es: string };

export function L(locale: Locale, value: LString | undefined | null): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value.en ?? value.es ?? "";
}

export function LList(locale: Locale, values: LString[]): string[] {
  return values.map((v) => L(locale, v));
}
