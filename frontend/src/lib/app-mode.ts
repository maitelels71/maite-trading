/** Build-time app mode: one codebase, two frontends (options vs futures). */

import { VENUE_META, type Venue } from "@/lib/types";

export type AppMode = "options" | "futures";

const RAW = (process.env.NEXT_PUBLIC_APP_MODE ?? "options").toLowerCase().trim();

export const APP_MODE: AppMode = RAW === "futures" ? "futures" : "options";

export const APP_VENUE: Venue =
  APP_MODE === "futures" ? "tradeadvocate" : "schwab";

export const APP_MODE_LABEL =
  APP_MODE === "futures" ? "Futures" : "Options";

export const APP_MODE_HINT = VENUE_META[APP_VENUE].hint;

/** Browser tab + brand title (mode first so truncated tabs stay clear). */
export const APP_DOCUMENT_TITLE = `${APP_MODE_LABEL} | Trading Like a Boss`;
