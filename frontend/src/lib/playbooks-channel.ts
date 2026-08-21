/** Channel CH01–CH06 — daily Yahoo scan filters (Options + Futures). */

import type { StrategyPlaybook } from "@/lib/playbook-types";
import type { Venue } from "@/lib/types";

/**
 * PDF notes (futures §5): Yahoo NQ=F / ES=F (~15m delay); Gap / ORB / VWAP /
 * relative volume anchor to NY RTH 9:30 ET — not Globex calendar day.
 * RS: equity vs SPY; MNQ/NQ vs MES/ES when bench available.
 */

type ChCore = {
  num: "01" | "02" | "03" | "04" | "05" | "06";
  strategyKey: string;
  name: string;
  summary: string;
  sessionWindow: string;
  riskNotes: string[];
  invalidation: string[];
  entrySteps: StrategyPlaybook["entrySteps"];
  exitSteps: StrategyPlaybook["exitSteps"];
  byTimeframe: StrategyPlaybook["byTimeframe"];
  syncTimeframes?: string[];
  syncLookbackDays?: number;
  preferredTimeframe?: string;
  setupImage: string;
};

const CH_CORE: ChCore[] = [
  {
    num: "01",
    strategyKey: "ch01_gap_go",
    name: "Gap & Go",
    summary:
      "Abre con gap >2% vs cierre RTH previo y volumen inicial >2× el promedio " +
      "de la sesión activa. Filtro de momentum vs ruido de apertura (9:30 ET).",
    sessionWindow: "RTH 9:30 ET · primeros 5m–15m (no Globex day)",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 10,
    setupImage: "/brand/ch01-gap-go.svg",
    riskNotes: [
      "Gap sin volumen = ruido — requiere 2× promedio de sesión RTH",
      "Yahoo delay ~15 min (NQ=F / ETFs) — análisis, no ejecución ciega",
      "Futuros: gap vs prior RTH close, no vs barra Globex overnight suelta",
    ],
    invalidation: [
      "Gap < 2%",
      "Volumen de apertura < 2× promedio RTH",
      "Gap que se llena de inmediato sin follow-through",
    ],
    entrySteps: [
      {
        id: "ch01-e1",
        label: "Medir gap vs cierre RTH previo",
        detail: "Abs(open 9:30 − prior RTH close) / prior ≥ 2%.",
      },
      {
        id: "ch01-e2",
        label: "Confirmar volumen inicial 2×",
        detail: "Primeras barras RTH vs promedio RTH reciente (5m).",
      },
      {
        id: "ch01-e3",
        label: "Dirección = lado del gap",
        detail: "Gap up → LONG · Gap down → SHORT.",
      },
    ],
    exitSteps: [
      { id: "ch01-x1", label: "TP1: extensión de la primera hora RTH" },
      { id: "ch01-x2", label: "Salir si el gap se llena contra la tesis" },
      { id: "ch01-x3", label: "Flat a cierre RTH si sigue abierta" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "Gap + volumen (Yahoo)",
        steps: [
          { id: "ch01-5-1", label: "Gap ≥2% vs prior RTH close" },
          { id: "ch01-5-2", label: "Volumen apertura ≥2× avg RTH" },
        ],
      },
    ],
  },
  {
    num: "02",
    strategyKey: "ch02_vwap_reversion",
    name: "VWAP Reversion",
    summary:
      "Precio se aleja ≥1.5σ del VWAP de sesión RTH y empieza a revertir. " +
      "En futuros el VWAP se resetea en la sesión (9:30 ET), no en el día Globex.",
    sessionWindow: "RTH · tras ≥12 barras 5m desde 9:30 ET",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 10,
    setupImage: "/brand/ch02-vwap-reversion.svg",
    riskNotes: [
      "Tendencia fuerte puede no revertir — no forzar",
      "VWAP = sesión RTH (reset 9:30), no rollover Globex completo",
      "Yahoo delay ~15 min",
    ],
    invalidation: [
      "|z| < 1.5σ",
      "Distancia al VWAP sigue ampliándose",
      "Sesión con muy pocas barras RTH",
    ],
    entrySteps: [
      {
        id: "ch02-e1",
        label: "Calcular VWAP RTH + σ",
        detail: "Desviación close − VWAP desde 9:30 ET.",
      },
      {
        id: "ch02-e2",
        label: "Esperar |z| ≥ 1.5 y vuelta",
        detail: "Última barra acerca el precio al VWAP.",
      },
      {
        id: "ch02-e3",
        label: "LONG debajo / SHORT arriba",
        detail: "Apostar a la media de sesión, no a la extensión.",
      },
    ],
    exitSteps: [
      { id: "ch02-x1", label: "TP cerca / en VWAP" },
      { id: "ch02-x2", label: "SL si hace nuevo extremo lejos del VWAP" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "VWAP sesión RTH ±1.5σ",
        steps: [
          { id: "ch02-5-1", label: "Marcar VWAP desde 9:30 ET" },
          { id: "ch02-5-2", label: "Extensión ≥1.5σ + reversion" },
        ],
      },
    ],
  },
  {
    num: "03",
    strategyKey: "ch03_ema_cross",
    name: "Cruce EMA 9/20",
    summary:
      "EMA 9 cruza EMA 20 al alza o a la baja en 5m, confirmado con volumen " +
      "creciente. Se traslada igual a futuros (MNQ/MES/…).",
    sessionWindow: "RTH · 5m (Yahoo)",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 10,
    setupImage: "/brand/ch03-ema-cross.svg",
    riskNotes: [
      "Cruce sin volumen = falso — requiere vol creciente",
      "En rango lateral hay whipsaws",
      "Yahoo delay ~15 min",
    ],
    invalidation: [
      "Sin cruce limpio EMA9/20",
      "Volumen no aumenta en la barra del cruce",
    ],
    entrySteps: [
      {
        id: "ch03-e1",
        label: "Detectar cruce EMA9 / EMA20",
        detail: "Bull: 9 cruza sobre 20 · Bear: 9 cruza bajo 20.",
      },
      {
        id: "ch03-e2",
        label: "Confirmar volumen creciente",
        detail: "Vol de la barra del cruce > barra previa.",
      },
    ],
    exitSteps: [
      { id: "ch03-x1", label: "TP en estructura 5m / 15m" },
      { id: "ch03-x2", label: "Salir si EMA9 vuelve a cruzar en contra" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "EMA cross + vol",
        steps: [
          { id: "ch03-5-1", label: "Cruce 9/20" },
          { id: "ch03-5-2", label: "Volumen creciente" },
        ],
      },
    ],
  },
  {
    num: "04",
    strategyKey: "ch04_rsi_extreme",
    name: "RSI extremo + fade",
    summary:
      "RSI(14) en 5m ≤30 o ≥70, con volumen decreciente en la extensión. " +
      "Volumen promedio / fade sobre la sesión RTH activa (futuros 24h ≠ avg Globex).",
    sessionWindow: "RTH · 5m",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 10,
    setupImage: "/brand/ch04-rsi-extreme.svg",
    riskNotes: [
      "RSI extremo puede seguir extremo en tendencias fuertes",
      "Volumen debe fadear en la sesión RTH — no mezclar overnight",
      "Yahoo delay ~15 min",
    ],
    invalidation: [
      "RSI entre 30 y 70",
      "Volumen aún acelerando en la extensión",
    ],
    entrySteps: [
      {
        id: "ch04-e1",
        label: "RSI ≤30 o ≥70",
        detail: "Oversold → LONG · Overbought → SHORT.",
      },
      {
        id: "ch04-e2",
        label: "Volumen fade en últimas 3 barras",
        detail: "Cada barra con menos volumen que la anterior.",
      },
    ],
    exitSteps: [
      { id: "ch04-x1", label: "TP al volver RSI a zona media" },
      { id: "ch04-x2", label: "SL si RSI hace nuevo extremo con vol alto" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "RSI + vol fade",
        steps: [
          { id: "ch04-5-1", label: "RSI extremo" },
          { id: "ch04-5-2", label: "Volumen decreciente (RTH)" },
        ],
      },
    ],
  },
  {
    num: "05",
    strategyKey: "ch05_rel_strength",
    name: "Relative Strength",
    summary:
      "Fuerza relativa en la ventana AM RTH: equity vs SPY/QQQ; futuros " +
      "MNQ/NQ vs MES/ES cuando hay bench. Si no, vs propio promedio 5d.",
    sessionWindow: "RTH · ~primera hora desde 9:30 ET",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 12,
    setupImage: "/brand/ch05-rel-strength.svg",
    riskNotes: [
      "Sin bench: proxy vs propio avg 5d (sync MES junto a MNQ ayuda)",
      "Momentum relativo no garantiza continuación",
      "Yahoo delay ~15 min",
    ],
    invalidation: [
      "Edge < 1pp vs benchmark / promedio",
      "Sesión sin barras suficientes en la ventana",
    ],
    entrySteps: [
      {
        id: "ch05-e1",
        label: "Medir retorno de la ventana AM RTH",
        detail: "~60 min desde 9:30 ET.",
      },
      {
        id: "ch05-e2",
        label: "Comparar vs índice / avg 5d",
        detail:
          "Equity: SPY. Futuros: MNQ↔MES. Outperform ≥1pp → LONG.",
      },
    ],
    exitSteps: [
      { id: "ch05-x1", label: "TP si el edge relativo se agota" },
      { id: "ch05-x2", label: "Salir si el índice de referencia gira en contra" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "RS ventana AM",
        steps: [
          { id: "ch05-5-1", label: "Retorno AM del ticker" },
          { id: "ch05-5-2", label: "Edge vs SPY o MES/ES / 5d avg" },
        ],
      },
    ],
  },
  {
    num: "06",
    strategyKey: "ch06_orb",
    name: "ORB 15–30m",
    summary:
      "Rompe high/low de los primeros 15–30 min de la sesión regular NQ/ES " +
      "(9:30 ET), con volumen de confirmación. No usar apertura Globex.",
    sessionWindow: "RTH · tras OR 9:30–9:45/10:00 ET",
    preferredTimeframe: "5m",
    syncTimeframes: ["5m"],
    syncLookbackDays: 5,
    setupImage: "/brand/ch06-orb.svg",
    riskNotes: [
      "ORB anclado a 9:30 ET cash/RTH — no al open Globex 18:00",
      "Default scan = 15m OR; params permiten 30m",
      "Yahoo delay ~15 min",
    ],
    invalidation: [
      "Sin ruptura de high/low del OR RTH",
      "Volumen de ruptura < 1.2× avg del OR",
    ],
    entrySteps: [
      {
        id: "ch06-e1",
        label: "Marcar high/low del OR RTH",
        detail: "Primeros 15m (default) o 30m desde 9:30 ET.",
      },
      {
        id: "ch06-e2",
        label: "Esperar close fuera del rango + vol",
        detail: "Close > high → LONG · Close < low → SHORT.",
      },
    ],
    exitSteps: [
      { id: "ch06-x1", label: "TP en extensión RTH / liquidez" },
      { id: "ch06-x2", label: "SL de vuelta dentro del OR" },
    ],
    byTimeframe: [
      {
        timeframe: "5m",
        focus: "ORB RTH + vol",
        steps: [
          { id: "ch06-5-1", label: "Definir OR 15–30m desde 9:30 ET" },
          { id: "ch06-5-2", label: "Break + volumen confirm" },
        ],
      },
    ],
  },
];

function chPlaybook(venue: Venue, core: ChCore): StrategyPlaybook {
  const isFutures = venue === "tradeadvocate";
  const id = isFutures ? `ch${core.num}f` : `ch${core.num}`;
  return {
    id,
    venue,
    group: "Channel · CH01–CH06",
    strategyKey: core.strategyKey,
    preferredTimeframe: core.preferredTimeframe ?? "5m",
    syncTimeframes: core.syncTimeframes ?? ["5m"],
    syncLookbackDays: core.syncLookbackDays ?? 10,
    name: core.name,
    shortName: `CH${core.num}`,
    setupImage: core.setupImage,
    markets: isFutures
      ? `Futuros LONG/SHORT · MNQ · MES · Yahoo NQ=F/ES=F · ${core.name}`
      : `Opciones CALL/PUT · Yahoo · ${core.name}`,
    summary: core.summary,
    sessionWindow: core.sessionWindow,
    riskNotes: [
      ...core.riskNotes,
      ...(isFutures
        ? []
        : ["Options: ATM/OTM en rango · plan 10/20/35% — no plan 100%"]),
    ],
    invalidation: core.invalidation,
    entrySteps: core.entrySteps.map((s) => ({
      ...s,
      id: `${id}-${s.id.split("-").slice(1).join("-")}`,
    })),
    exitSteps: core.exitSteps.map((s) => ({
      ...s,
      id: `${id}-${s.id.split("-").slice(1).join("-")}`,
    })),
    byTimeframe: core.byTimeframe.map((tf) => ({
      ...tf,
      steps: tf.steps.map((s) => ({
        ...s,
        id: `${id}-${s.id.split("-").slice(1).join("-")}`,
      })),
    })),
  };
}

/** Options desk */
export const CHANNEL_OPTIONS = CH_CORE.map((c) => chPlaybook("schwab", c));

/** Futures desk */
export const CHANNEL_FUTURES = CH_CORE.map((c) =>
  chPlaybook("tradeadvocate", c),
);

/** @deprecated use CHANNEL_OPTIONS — kept for older imports */
export const CHANNEL_PLAYBOOKS = CHANNEL_OPTIONS;

export const CH_ORDER = [
  "ch01",
  "ch02",
  "ch03",
  "ch04",
  "ch05",
  "ch06",
] as const;

export const CH_FUTURES_ORDER = [
  "ch01f",
  "ch02f",
  "ch03f",
  "ch04f",
  "ch05f",
  "ch06f",
] as const;
