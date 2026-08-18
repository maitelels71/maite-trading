/** Cross-tab flag: freeze Positions polls while Session Trigger is armed for Open. */

export const HOLD_TRADER_KEY = "maite.schwab.holdTrader";
const HOLD_EVENT = "maite-hold-trader";

export function readHoldTrader(): boolean {
  try {
    return window.localStorage.getItem(HOLD_TRADER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHoldTrader(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(HOLD_TRADER_KEY, "1");
    else window.localStorage.removeItem(HOLD_TRADER_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(HOLD_EVENT));
}

export function subscribeHoldTrader(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === HOLD_TRADER_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HOLD_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HOLD_EVENT, onChange);
  };
}
