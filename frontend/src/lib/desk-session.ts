/** Hub session token (Trading Like a Boss landing login). */

export const DESK_SESSION_KEY = "maite.desk.session";

export function getDeskToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(DESK_SESSION_KEY) || "";
}

export function setDeskToken(token: string): void {
  window.localStorage.setItem(DESK_SESSION_KEY, token);
}

export function clearDeskToken(): void {
  window.localStorage.removeItem(DESK_SESSION_KEY);
}
