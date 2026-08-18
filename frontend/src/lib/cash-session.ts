/** NYSE/Nasdaq regular hours — weekday 9:30–4:00 ET. Matches backend is_cash_rth. */

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
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
