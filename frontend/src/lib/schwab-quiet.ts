/** Cross-tab Schwab cool-down so Open 429 also blocks Close, and vice versa. */

export const QUIET_KEY = "maite.schwab.quietUntil";
const QUIET_EVENT = "maite-schwab-quiet";

export function readSchwabQuietUntil(): number {
  try {
    const n = Number(window.localStorage.getItem(QUIET_KEY) || "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function extendSchwabQuiet(ms: number): number {
  const until = Math.max(readSchwabQuietUntil(), Date.now() + ms);
  try {
    window.localStorage.setItem(QUIET_KEY, String(until));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(QUIET_EVENT));
  return until;
}

export function subscribeSchwabQuiet(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === QUIET_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(QUIET_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(QUIET_EVENT, onChange);
  };
}
