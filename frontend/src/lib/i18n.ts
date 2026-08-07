export type Locale = "en" | "es";

export const LOCALE_STORAGE_KEY = "maite.locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "es";
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(raw) ? raw : "en";
}

export function persistLocale(locale: Locale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

type Dict = Record<string, string>;

const en: Dict = {
  "nav.daily": "Daily",
  "nav.mind": "Mind",
  "nav.strategies": "Strategies",
  "nav.analyzer": "Analyzer",
  "nav.news": "News",
  "nav.admin": "Admin",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "lang.en": "EN",
  "lang.es": "ES",

  "strategies.title": "Strategies",
  "strategies.subtitle":
    "Playbooks with entry rules by timeframe, then a live scan of which symbols currently meet that strategy.",
  "strategies.liveScanTitle": "Live scan · this strategy",
  "strategies.liveScanHint":
    "Which tickers currently match when you review — organized by this playbook only.",
  "strategies.scanNow": "Scan now",
  "strategies.scanning": "Scanning…",
  "strategies.draft": "Draft playbook",
  "strategies.scanReady": "Scan ready",
  "strategies.draftHint":
    "Checklist only — not connected to the live scan engine yet. Use the rules while you trade; ORB books can Scan now.",
  "strategies.draftError":
    "This playbook is a draft — not wired to the live scan engine yet.",
  "strategies.venue": "Venue",
  "strategies.allVenues": "All venues",
  "strategies.timeframe": "Timeframe",
  "strategies.sessionDate": "Session date (NY)",

  "daily.title": "Daily review",
  "daily.subtitle":
    "Professional process checklist — pre-open, session, and post. Auto-saved in this browser per NY session date.",
  "daily.sessionDate": "Session date (NY)",
  "daily.reset": "Reset day",
  "daily.save": "Save",
  "daily.saved": "Saved",
  "daily.saveHint": "Saved in this browser (localStorage key maite.daily-review.YYYY-MM-DD).",
  "daily.copyNotion": "Copy for Notion",
  "daily.copiedNotion": "Copied — paste into Notion",
  "daily.progress": "Progress",
  "daily.bias": "Daily bias (one line)",
  "daily.notes": "Notes / journal",
  "daily.notionNote":
    "Notion sync (API) is not connected yet. Copy creates a Notion-ready markdown block for your journal DB.",
};

const es: Dict = {
  "nav.daily": "Diario",
  "nav.mind": "Mente",
  "nav.strategies": "Estrategias",
  "nav.analyzer": "Analizador",
  "nav.news": "Noticias",
  "nav.admin": "Admin",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "lang.en": "EN",
  "lang.es": "ES",

  "strategies.title": "Estrategias",
  "strategies.subtitle":
    "Playbooks con reglas de entrada por timeframe y un scan en vivo de qué símbolos cumplen esa estrategia.",
  "strategies.liveScanTitle": "Live scan · esta estrategia",
  "strategies.liveScanHint":
    "Qué tickers coinciden ahora al revisar — solo para este playbook.",
  "strategies.scanNow": "Escanear ahora",
  "strategies.scanning": "Escaneando…",
  "strategies.draft": "Playbook borrador",
  "strategies.scanReady": "Listo para scan",
  "strategies.draftHint":
    "Solo checklist — aún no está conectado al motor de scan. Usa las reglas al operar; los libros ORB sí pueden Escanear ahora.",
  "strategies.draftError":
    "Este playbook es borrador — todavía no está conectado al scan en vivo.",
  "strategies.venue": "Venue",
  "strategies.allVenues": "Todos los venues",
  "strategies.timeframe": "Timeframe",
  "strategies.sessionDate": "Fecha de sesión (NY)",

  "daily.title": "Revisión diaria",
  "daily.subtitle":
    "Checklist profesional — pre-apertura, sesión y post. Se guarda solo en este navegador por fecha de sesión NY.",
  "daily.sessionDate": "Fecha de sesión (NY)",
  "daily.reset": "Resetear día",
  "daily.save": "Guardar",
  "daily.saved": "Guardado",
  "daily.saveHint":
    "Se guarda en este navegador (localStorage: maite.daily-review.YYYY-MM-DD).",
  "daily.copyNotion": "Copiar para Notion",
  "daily.copiedNotion": "Copiado — pega en Notion",
  "daily.progress": "Progreso",
  "daily.bias": "Bias del día (una línea)",
  "daily.notes": "Notas / diario",
  "daily.notionNote":
    "La sync con Notion (API) aún no está conectada. Copiar crea un bloque markdown listo para tu base de journal.",
};

const TABLES: Record<Locale, Dict> = { en, es };

export function translate(locale: Locale, key: string): string {
  return TABLES[locale][key] ?? TABLES.en[key] ?? key;
}
