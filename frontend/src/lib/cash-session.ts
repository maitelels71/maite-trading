/** NY session clocks — matches backend session_calendar (cash RTH + CME Globex). */

const RTH_OPEN_MIN = 9 * 60 + 30;
const RTH_CLOSE_MIN = 16 * 60;
const GLOBEX_HALT_MIN = 17 * 60;
const GLOBEX_REOPEN_MIN = 18 * 60;

function nyClock(now = new Date()): { wd: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const day = Number(parts.day);
  const hh = Number(parts.hour);
  const mm = Number(parts.minute);
  const wd = new Date(Date.UTC(y, m - 1, day, 12)).getUTCDay();
  return { wd, minutes: hh * 60 + mm };
}

export function isCashRthNy(now = new Date()): boolean {
  const { wd, minutes } = nyClock(now);
  if (wd === 0 || wd === 6) return false;
  return minutes >= RTH_OPEN_MIN && minutes < RTH_CLOSE_MIN;
}

export function isGlobexOpenNy(now = new Date()): boolean {
  const { wd, minutes } = nyClock(now);
  if (wd === 6) return false;
  if (wd === 0) return minutes >= GLOBEX_REOPEN_MIN;
  if (wd === 5) return minutes < GLOBEX_HALT_MIN;
  return minutes < GLOBEX_HALT_MIN || minutes >= GLOBEX_REOPEN_MIN;
}

/** True after NY cash close while Globex overnight / Asia is the live window. */
export function isFuturesOvernightNy(now = new Date()): boolean {
  return isGlobexOpenNy(now) && !isCashRthNy(now);
}
