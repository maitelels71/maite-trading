/** App brand + desk mode (Options vs Futures). */

import { VENUE_META, type Venue } from "@/lib/types";

export type AppMode = "options" | "futures";

export function venueForMode(mode: AppMode): Venue {
  return mode === "futures" ? "tradeadvocate" : "schwab";
}

export function labelForMode(mode: AppMode): string {
  return mode === "futures" ? "Futures" : "Options";
}

export function parseAppMode(raw: string | null | undefined): AppMode | null {
  const value = (raw || "").toLowerCase().trim();
  if (value === "futures" || value === "options") return value;
  return null;
}

const RAW = (process.env.NEXT_PUBLIC_APP_MODE ?? "options").toLowerCase().trim();

/** Build default when the URL has no ?mode= (staging still builds two sites). */
export const APP_MODE: AppMode = RAW === "futures" ? "futures" : "options";

export const APP_VENUE: Venue = venueForMode(APP_MODE);

export const APP_MODE_LABEL = labelForMode(APP_MODE);

export const APP_MODE_HINT = VENUE_META[APP_VENUE].hint;

export const APP_DOCUMENT_TITLE = "Trading Like a Boss";

/** One house icon for the tab (charging bull). */
export const APP_ICON_PNG = "/brand/charging-bull.png";
export const APP_ICON_SVG = "/brand/charging-bull.png";

export function optionsDeskHref(): string {
  // Explicit index.html — CloudFront/S3 OAC returns hub index for /desk/ (403→/index.html).
  return "/desk/index.html?mode=options";
}

export function futuresDeskHref(): string {
  return "/desk/index.html?mode=futures&scan=1";
}

export function coinbaseDeskHref(): string {
  return "/coinbase/index.html";
}

export function deskViewHref(view: string, mode: AppMode): string {
  return `/desk/index.html?view=${encodeURIComponent(view)}&mode=${mode}`;
}

/** Map /desk/ and /coinbase/ to …/index.html so static hosting serves the right page. */
export function toStaticHtmlPath(pathWithSearch: string): string {
  const raw = (pathWithSearch || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw, "https://desk.local");
    const p = u.pathname;
    if (p === "/desk" || p === "/desk/") u.pathname = "/desk/index.html";
    else if (p === "/coinbase" || p === "/coinbase/") u.pathname = "/coinbase/index.html";
    else if (p.endsWith("/") && p !== "/" && !p.endsWith("/index.html")) {
      u.pathname = `${p}index.html`;
    }
    return `${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}
