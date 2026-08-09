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
  "nav.journal": "Journal",
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
  "daily.saveNotion": "Save to Notion",
  "daily.savingNotion": "Saving to Notion…",
  "daily.savedNotion": "Saved to Notion",
  "daily.openNotion": "Open in Notion",
  "daily.progress": "Progress",
  "daily.bias": "Daily bias (one line)",
  "daily.notes": "Notes / journal",
  "daily.notionNote":
    "Save to Notion writes this day’s checklist into your Daily Review database (one page per NY date).",

  "journal.title": "Trade journal",
  "journal.subtitle":
    "One trade per save — plan, levels, result, and screenshots → Notion Trade Journal Desk.",
  "journal.hint":
    "Before: 1H + 15m + entry TF. After: entry TF (+ optional 15m). Max 3 before / 2 after.",
  "journal.saveNotion": "Save to Notion",
  "journal.saving": "Saving to Notion…",
  "journal.saved": "Saved to Notion",
  "journal.openNotion": "Open in Notion",
  "journal.reset": "New trade",
  "journal.date": "Session date (NY)",
  "journal.activo": "Activo",
  "journal.side": "Side",
  "journal.session": "Session",
  "journal.playbook": "Playbook",
  "journal.tf": "TF setup",
  "journal.status": "Status",
  "journal.stuck": "Stuck to plan?",
  "journal.entry": "Entry",
  "journal.sl": "SL",
  "journal.tp": "TP",
  "journal.be": "BE",
  "journal.rPlanned": "R planned",
  "journal.rReal": "R real",
  "journal.pnl": "PnL USD",
  "journal.thesis": "Thesis (before)",
  "journal.what": "What happened",
  "journal.lesson": "Lesson",
  "journal.beforeShots": "Screenshots — before",
  "journal.beforeHint": "Context → zone → trigger (1H / 15m / entry). Click a box → Ctrl+V from TradingView.",
  "journal.afterShots": "Screenshots — after",
  "journal.afterHint": "Same entry TF (+ optional 15m) with exit / BE marked. Click → Ctrl+V.",
  "journal.clearShot": "Clear",
  "journal.pasteHint": "Click here, then Ctrl+V (paste from TradingView)",
  "journal.orFile": "Or choose a file…",
};

const es: Dict = {
  "nav.daily": "Diario",
  "nav.journal": "Journal",
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
  "daily.saveNotion": "Guardar en Notion",
  "daily.savingNotion": "Guardando en Notion…",
  "daily.savedNotion": "Guardado en Notion",
  "daily.openNotion": "Abrir en Notion",
  "daily.progress": "Progreso",
  "daily.bias": "Bias del día (una línea)",
  "daily.notes": "Notas / diario",
  "daily.notionNote":
    "Guardar en Notion escribe el checklist de este día en tu DB Daily Review (una página por fecha NY).",

  "journal.title": "Trade journal",
  "journal.subtitle":
    "Un trade por guardado — plan, niveles, resultado y screenshots → Notion Trade Journal Desk.",
  "journal.hint":
    "Antes: 1H + 15m + TF de entrada. Después: TF de entrada (+ 15m opcional). Máx 3 antes / 2 después.",
  "journal.saveNotion": "Guardar en Notion",
  "journal.saving": "Guardando en Notion…",
  "journal.saved": "Guardado en Notion",
  "journal.openNotion": "Abrir en Notion",
  "journal.reset": "Nuevo trade",
  "journal.date": "Fecha de sesión (NY)",
  "journal.activo": "Activo",
  "journal.side": "Lado",
  "journal.session": "Sesión",
  "journal.playbook": "Playbook",
  "journal.tf": "TF setup",
  "journal.status": "Status",
  "journal.stuck": "¿Seguí el plan?",
  "journal.entry": "Entry",
  "journal.sl": "SL",
  "journal.tp": "TP",
  "journal.be": "BE",
  "journal.rPlanned": "R planeado",
  "journal.rReal": "R real",
  "journal.pnl": "PnL USD",
  "journal.thesis": "Tesis (antes)",
  "journal.what": "Qué pasó",
  "journal.lesson": "Lección",
  "journal.beforeShots": "Screenshots — antes",
  "journal.beforeHint":
    "Contexto → zona → trigger (1H / 15m / entrada). Click en la caja → Ctrl+V desde TradingView.",
  "journal.afterShots": "Screenshots — después",
  "journal.afterHint":
    "Mismo TF de entrada (+ 15m opcional) con salida / BE. Click → Ctrl+V.",
  "journal.clearShot": "Quitar",
  "journal.pasteHint": "Click aquí, luego Ctrl+V (pegar desde TradingView)",
  "journal.orFile": "O elige un archivo…",
};

const TABLES: Record<Locale, Dict> = { en, es };

export function translate(locale: Locale, key: string): string {
  return TABLES[locale][key] ?? TABLES.en[key] ?? key;
}
