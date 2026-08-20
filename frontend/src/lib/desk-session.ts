/** Hub session token (Trading Like a Boss landing login). */

export const DESK_SESSION_KEY = "maite.desk.session";

export function getDeskToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      window.localStorage.getItem(DESK_SESSION_KEY) ||
      window.sessionStorage.getItem(DESK_SESSION_KEY) ||
      ""
    );
  } catch {
    return "";
  }
}

export function setDeskToken(token: string): void {
  try {
    window.localStorage.setItem(DESK_SESSION_KEY, token);
  } catch {
    /* private mode, etc. */
  }
  try {
    window.sessionStorage.setItem(DESK_SESSION_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearDeskToken(): void {
  try {
    window.localStorage.removeItem(DESK_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.removeItem(DESK_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Pull one-shot token from `#ds=...` (same-tab / new-tab handoff). */
export function absorbDeskTokenFromLocation(): string {
  if (typeof window === "undefined") return getDeskToken();
  const raw = window.location.hash;
  const match = /^#ds=([^&]+)/.exec(raw);
  if (match) {
    try {
      const token = decodeURIComponent(match[1]);
      if (token) setDeskToken(token);
    } catch {
      /* ignore bad hash */
    }
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", clean);
  }
  return getDeskToken();
}

/** Append handoff hash so /desk and /coinbase keep the hub session. */
export function withDeskSessionHash(href: string, token?: string): string {
  const t = (token || getDeskToken()).trim();
  if (!t) return href;
  const base = href.split("#")[0];
  return `${base}#ds=${encodeURIComponent(t)}`;
}
