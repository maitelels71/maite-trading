/** Hub session token (Trading Like a Boss landing login). */

export const DESK_SESSION_KEY = "maite.desk.session";
const DESK_COOKIE = "maite_desk_session";
const COOKIE_MAX_AGE_SEC = 7 * 24 * 3600;

/** Survives full page loads within the same JS lifetime only. */
let memoryToken = "";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1));
    } catch {
      return "";
    }
  }
  return "";
}

function writeCookie(token: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${DESK_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function clearCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${DESK_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function getDeskToken(): string {
  if (typeof window === "undefined") return "";
  if (memoryToken.trim()) return memoryToken.trim();
  try {
    const fromLs = window.localStorage.getItem(DESK_SESSION_KEY) || "";
    if (fromLs.trim()) {
      memoryToken = fromLs.trim();
      return memoryToken;
    }
  } catch {
    /* ignore */
  }
  try {
    const fromSs = window.sessionStorage.getItem(DESK_SESSION_KEY) || "";
    if (fromSs.trim()) {
      memoryToken = fromSs.trim();
      return memoryToken;
    }
  } catch {
    /* ignore */
  }
  const fromCookie = readCookie(DESK_COOKIE).trim();
  if (fromCookie) {
    memoryToken = fromCookie;
    return memoryToken;
  }
  return "";
}

export function setDeskToken(token: string): void {
  const t = token.trim();
  memoryToken = t;
  if (!t) {
    clearDeskToken();
    return;
  }
  try {
    window.localStorage.setItem(DESK_SESSION_KEY, t);
  } catch {
    /* private mode, etc. */
  }
  try {
    window.sessionStorage.setItem(DESK_SESSION_KEY, t);
  } catch {
    /* ignore */
  }
  writeCookie(t);
}

export function clearDeskToken(): void {
  memoryToken = "";
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
  clearCookie();
}

function takeTokenFromSearch(): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("ds") || "";
    if (!raw) return "";
    url.searchParams.delete("ds");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return "";
  }
}

function takeTokenFromHash(): string {
  if (typeof window === "undefined") return "";
  const raw = window.location.hash;
  const match = /^#ds=([^&]+)/.exec(raw);
  if (!match) return "";
  let token = "";
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    token = match[1] || "";
  }
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", clean);
  return token;
}

/** Pull one-shot token from `?ds=` or `#ds=` (handoff). Cookie/localStorage preferred. */
export function absorbDeskTokenFromLocation(): string {
  if (typeof window === "undefined") return getDeskToken();
  const fromQuery = takeTokenFromSearch();
  if (fromQuery.trim()) setDeskToken(fromQuery);
  const fromHash = takeTokenFromHash();
  if (fromHash.trim()) setDeskToken(fromHash);
  return getDeskToken();
}

/**
 * Append handoff so /desk and /coinbase keep the hub session even if storage
 * is flaky or a static-host redirect drops the hash.
 */
export function withDeskSessionHash(href: string, token?: string): string {
  const t = (token || getDeskToken()).trim();
  if (!t) return href;
  const [withoutHash] = href.split("#");
  try {
    const url = new URL(withoutHash, "https://desk.local");
    url.searchParams.set("ds", t);
    return `${url.pathname}${url.search}#ds=${encodeURIComponent(t)}`;
  } catch {
    const join = withoutHash.includes("?") ? "&" : "?";
    return `${withoutHash}${join}ds=${encodeURIComponent(t)}#ds=${encodeURIComponent(t)}`;
  }
}
