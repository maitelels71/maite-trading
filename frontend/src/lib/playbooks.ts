/** Strategy playbooks — process rules by timeframe (not broker logic). */

import type {
  PlaybookStep,
  PlaybookTimeframe,
  StrategyPlaybook,
} from "@/lib/playbook-types";
import {
  CREANDO_RIQUEZAS_PLAYBOOKS,
  CR_ORDER,
} from "@/lib/playbooks-creando-riquezas";
import {
  CHANNEL_OPTIONS,
  CH_ORDER,
} from "@/lib/playbooks-channel";
import { FUTURES_PLAYBOOKS, ML_ORDER } from "@/lib/playbooks-futures";
import { ML02_OPTIONS } from "@/lib/playbooks-ml02";
import type { Venue } from "@/lib/types";

export type { PlaybookStep, PlaybookTimeframe, StrategyPlaybook };

const ETF_BB_PLAYBOOKS: StrategyPlaybook[] = [
  {
    id: "e01",
    venue: "schwab",
    group: "BB · E01–E04",
    setupImage: "/brand/e01-bb-trend-flip.png",
    strategyKey: "bb_trend_flip_h",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h", "15m"],
    syncLookbackDays: 14,
    name: "E01 — Cambio de tendencia Bollinger H",
    shortName: "E01",
    markets: "Opciones CALL/PUT · BB Hora + 15m · línea de tendencia",
    summary:
      "Tras tendencia ≥2 días, en HORA rompe línea de tendencia Y punto medio BB (vela completa o gap). Luego 15m punto medio a favor → CALL/PUT. Plan 35% (no 100%). Scan: mid flip Hora + 15m alineado (línea de tendencia = checklist).",
    sessionWindow: "Intradía / 1–3 días · confirma en Hora, entra en 15m",
    riskNotes: [
      "Plan 10 / 20 / 35% — NO usar para plan 100%",
      "Ambas rupturas (línea + mid) obligatorias — una sola = no entrar",
      "Vela Hora completa (10:00–16:00 = 4×15m); 1.ª hora = excepción 2×15m",
      "En MA40 sin el 35% → salir. H-Line previa puede ser el techo real",
      "Scan no dibuja la línea A→B — confírmala en el chart antes de click",
    ],
    invalidation: [
      "Tendencia previa < 2 días",
      "Solo rompe línea O solo mid (falta el segundo)",
      "Vela Hora incompleta / neutral / a medias",
      "15m aún en contra (CALL: mid bajista / PUT: mid alcista)",
      "Continuidad (bajista→bajista) sin cambio real",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "e01-e1",
        label: "Trazar línea de tendencia (≥2 toques, ≥2 días)",
        detail: "CALL: techos decrecientes arriba. PUT: pisos crecientes abajo.",
      },
      {
        id: "e01-e2",
        label: "HORA: ruptura de la línea (vela completa o gap)",
        detail: "No confirmar con 15/30 min a medias.",
      },
      {
        id: "e01-e3",
        label: "HORA: ruptura del punto medio BB (los dos)",
        detail: "Gap que rompe ambos = OK inmediato. Si no, espera el segundo.",
      },
      {
        id: "e01-e4",
        label: "15m: punto medio a favor → entrar al cierre de esa vela",
        detail: "CALL: mid alcista · PUT: mid bajista. Mnemónico L-T-2H-15-C/P.",
      },
      {
        id: "e01-e5",
        label: "Ejecutar ATM · spread OK · vencimiento alineado · plan ≤35%",
      },
    ],
    exitSteps: [
      { id: "e01-x1", label: "Objetivo mínimo: mid Hora ya roto (req. 3)" },
      { id: "e01-x2", label: "Techo: MA40 Hora o H-Line previa" },
      { id: "e01-x3", label: "Ventana 1–3 días — retrocesos orgánicos OK" },
      { id: "e01-x4", label: "Sin confianza para hold 1–3 días → paper only" },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Panorama",
        steps: [
          { id: "e01-d1", label: "Tendencia previa ≥2 días visible" },
          { id: "e01-d2", label: "Edge lines / MA40 / FED-earnings check" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Confirmación (50% del análisis BB)",
        steps: [
          { id: "e01-h1", label: "Línea A→B + mid BB" },
          { id: "e01-h2", label: "Esperar vela Hora completa" },
          { id: "e01-h3", label: "Ambas rupturas antes de mirar 15m" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Timing de entrada",
        steps: [
          { id: "e01-15-1", label: "Mid BB a favor del nuevo sesgo" },
          { id: "e01-15-2", label: "Entrar al cierre — no a medias" },
        ],
      },
    ],
  },

  {
    id: "e02",
    venue: "schwab",
    group: "BB · E01–E04",
    setupImage: "/brand/e02-daily-mid-bounce.png",
    strategyKey: "daily_mid_bounce",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h", "1d", "15m"],
    syncLookbackDays: 30,
    name: "E02 — Rebote punto medio DÍA",
    shortName: "E02",
    markets: "Opciones CALL/PUT · BB Día (MA20 marcada) + Hora + 15m",
    summary:
      "Precio se acerca durante días al MA20 DÍA, lo respeta (no lo rompe), rebota en 15m, y entra solo con vela HORA completa a favor. D↑ H↓ → CALL · D↓ H↑ → PUT.",
    sessionWindow: "Intradía / multi-día · paciencia (15m–2 días)",
    riskNotes: [
      "Plan hasta 100% · paciencia obligatoria",
      "15m es señal — NUNCA la entrada; Hora confirma",
      "Marcar MA20 DÍA en el gráfico o operas a ciegas",
      "Vencimiento Jue PM / Vie AM → semana siguiente",
      "Scan: D mid + H pullback + Hora confirm — rebote 15m sigue checklist",
    ],
    invalidation: [
      "Sin MA20 DÍA marcada en el chart",
      "DÍA no claramente alcista (CALL) / bajista (PUT)",
      "Rompe el nivel diario en vez de respetarlo",
      "Entrar solo por rebote 15m sin vela Hora",
      "Continuidad (ej. D bajista + precio bajando hacia mid para CALL)",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "e02-e1",
        label: "Marcar MA20 Bollinger DÍA en el gráfico",
        detail: "Línea horizontal visible mientras operas en Hora/15m.",
      },
      {
        id: "e02-e2",
        label: "Panorama: D y H en dirección opuesta",
        detail: "CALL: D alcista + H bajista. PUT: D bajista + H alcista.",
      },
      {
        id: "e02-e3",
        label: "Precio se acerca al mid DÍA (ideal 2–3+ días)",
        detail: "Acercamiento progresivo, no un spike aleatorio.",
      },
      {
        id: "e02-e4",
        label: "Toca y respeta — no rompe el nivel",
        detail: "CALL queda arriba · PUT queda abajo tras el toque.",
      },
      {
        id: "e02-e5",
        label: "Rebote visible en 15m (AMARILLO — aún no entrar)",
      },
      {
        id: "e02-e6",
        label: "Vela HORA completa a favor → CALL/PUT",
        detail: "Alcista clara para CALL · bajista clara para PUT. Sin indecisión.",
      },
    ],
    exitSteps: [
      { id: "e02-x1", label: "Dejar correr si panorama sigue claro (no panic por theta)" },
      { id: "e02-x2", label: "Objetivo: rebote a favor desde MA20 DÍA (hasta 100%)" },
      { id: "e02-x3", label: "Salir si rompe el mid DÍA en contra de la tesis" },
      { id: "e02-x4", label: "Camino limpio: salir en H-Line / MA obstáculo si bloquea" },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Nivel del rebote",
        steps: [
          { id: "e02-d1", label: "Punto medio BB claramente alcista o bajista" },
          { id: "e02-d2", label: "Marcar MA20 como soporte/resistencia horizontal" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Confirmación de entrada",
        steps: [
          { id: "e02-h1", label: "Tendencia H opuesta a D (acercamiento)" },
          { id: "e02-h2", label: "Esperar vela HORA completa — no 15/30 min" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Señal solamente",
        steps: [
          { id: "e02-15-1", label: "Ver rebote — no click todavía" },
          { id: "e02-15-2", label: "Si 15m rebota pero Hora no confirma → esperar" },
        ],
      },
    ],
  },

  {
    id: "e03",
    venue: "schwab",
    group: "BB · E01–E04",
    setupImage: "/brand/e03-magnet-ma20.png",
    strategyKey: "magnet_ma20_gap",
    preferredTimeframe: "15m",
    syncTimeframes: ["15m", "1h"],
    syncLookbackDays: 14,
    name: "E03 — Efecto imán (gap → MA20 Hora)",
    shortName: "E03",
    markets: "Opciones CALL/PUT · TC2000 MA20/40 Hora + BB 15m + Worden Stoch vol",
    summary:
      "Tendencia fuerte ≥2 días en HORA + gap extremo lejos de MA20 Hora. El precio actúa como imán hacia la MA20. Alcista+gap↑ → PUT; bajista+gap↓ → CALL.",
    sessionWindow: "Apertura / primeras velas 15m · desarrollo mismo día o 1–2 días",
    riskNotes: [
      "Plan hasta 100% (o 10–50% según plan del día)",
      "Scan v1: Worden Stoch sigue manual — confirma volumen en checklist",
      "Vencimiento Jue PM / Vie AM → semana siguiente",
      "No confundir con E04: aquí hay tendencia HORA, no lateral BB15",
    ],
    invalidation: [
      "MA20/40 Hora laterales, pegadas o entrelazadas",
      "Otra MA (ej. 100) entre precio y MA20 Hora (camino bloqueado)",
      "1.ª vela 15m toca la banda (debe estar 100% fuera, mecha incluida)",
      "Gap “grande” pero normal para esa acción",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "e03-e1",
        label: "HORA: MA20/40 separándose ≥2 días (tendencia clara)",
        detail: "MA20>MA40 alcista · MA20<MA40 bajista. Sin entrelazado.",
      },
      {
        id: "e03-e2",
        label: "Gap/salto anormalmente lejos de MA20 Hora",
        detail: "Comparar con saltos habituales de esa empresa.",
      },
      {
        id: "e03-e3",
        label: "1.ª vela 15m completa 100% fuera de Bollinger",
        detail: "Esperar cierre de esa vela — no anticipar.",
      },
      {
        id: "e03-e4",
        label: "En 2.ª vela 15m: volumen Hora cruza roja Worden Stoch",
        detail: "Tendencia↑+gap↑ → PUT · Tendencia↓+gap↓ → CALL.",
      },
      {
        id: "e03-e5",
        label: "Camino limpio hacia MA20 Hora",
        detail: "Sin MA / H-Line / cierre ayer bloqueando el imán.",
      },
    ],
    exitSteps: [
      { id: "e03-x1", label: "Objetivo mínimo: acercamiento a MA20 Hora" },
      { id: "e03-x2", label: "Extendido: MA40 Hora si el path sigue limpio" },
      { id: "e03-x3", label: "No panic-exit en consolidación si req. siguen OK" },
      { id: "e03-x4", label: "Salir si aparece obstáculo MA o tesis de tendencia se rompe" },
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Tendencia + imán + volumen",
        steps: [
          { id: "e03-h1", label: "Panel: MA20 (amarilla) + MA40 (roja)" },
          { id: "e03-h2", label: "Volumen + Worden Stoch (línea roja)" },
          { id: "e03-h3", label: "Medir distancia gap vs MA20" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Exposición BB + timing",
        steps: [
          { id: "e03-15-1", label: "1.ª vela post-gap 100% fuera BB" },
          { id: "e03-15-2", label: "2.ª vela: confirmar vol Hora → ejecutar" },
        ],
      },
    ],
  },

  {
    id: "e04",
    venue: "schwab",
    group: "BB · E01–E04",
    setupImage: "/brand/e04-bb15-gap-open.png",
    strategyKey: "bb15_gap_open",
    preferredTimeframe: "15m",
    syncTimeframes: ["15m"],
    syncLookbackDays: 7,
    name: "E04 — Lateral BB15 + gap (5 min)",
    shortName: "E04",
    markets: "Opciones CALL/PUT · underlyings líquidos (Schwab) · TC2000 BB 15m",
    summary:
      "Cierre previo lateral con Bollinger 15m apretado. Gap extremo fuera de banda + precio ya revierte → CALL/PUT en los primeros 5 min. Distinto de E03 (imán HORA).",
    sessionWindow: "Primeros 5 minutos RTH (9:30–9:35 ET) — después desactiva",
    riskNotes: [
      "Plan hasta 100% · movimiento en minutos",
      "Siempre pon límite — a veces solo llega al mid, a veces al disipador opuesto",
      "Si bid/ask loco por el gap, espera segundos a que normalice el spread",
      "Vencimiento: Lun–Mié → viernes; Jue PM / Vie AM → semana siguiente",
    ],
    invalidation: [
      "Punto medio 15m no lateral (subiendo o bajando) al cierre previo",
      "Bandas anchas / mucha volatilidad ayer (no squeeze)",
      "Gap no extremo vs gaps habituales de esa acción",
      "Vol BB se abre al gap pero NO empieza a cerrar al revertir",
      "Entrada después de 9:35 ET",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "e04-e1",
        label: "BB 15m ayer: lateral + bandas estrechas",
        detail: "Punto medio plano; poca distancia entre disipadores al cierre.",
      },
      {
        id: "e04-e2",
        label: "Gap extremo fuera de banda + ya revierte",
        detail:
          "Gap↓ lejos inferior + sube → CALL. Gap↑ lejos superior + baja → PUT. Relativo a esa acción.",
      },
      {
        id: "e04-e3",
        label: "Entrar en ≤5 min con spread normalizado",
        detail: "ATM · límite puesto · no forzar si spread sigue loco.",
      },
      {
        id: "e04-e4",
        label: "Confirmar que vol BB empieza a cerrar hacia el mid",
        detail: "Si bandas siguen abiertas sin cerrar → ya no es E04.",
      },
    ],
    exitSteps: [
      { id: "e04-x1", label: "Objetivo mínimo: retorno hacia punto medio BB 15m" },
      {
        id: "e04-x2",
        label: "Objetivo extendido: disipador opuesto (si el path lo permite)",
      },
      { id: "e04-x3", label: "Salir si vol permanece abierta — tesis rota" },
      { id: "e04-x4", label: "No perseguir después de la ventana de 5 min" },
    ],
    byTimeframe: [
      {
        timeframe: "Pre-market",
        focus: "Anticipar gap",
        steps: [
          { id: "e04-pm1", label: "¿FED / earnings hoy? → STOP" },
          { id: "e04-pm2", label: "Revisar tamaño de gap pre-market vs norma del ticker" },
          { id: "e04-pm3", label: "¿Ayer BB15 lateral + squeeze? Si no → skip E04" },
        ],
      },
      {
        timeframe: "15m",
        focus: "Única temporalidad de ejecución",
        steps: [
          { id: "e04-15-1", label: "Solo Bollinger (20,2) — sin MAs hora" },
          { id: "e04-15-2", label: "Ver exposición total fuera de banda al open" },
          { id: "e04-15-3", label: "Confirmar dirección de reversión antes de click" },
        ],
      },
    ],
  },
];

export const STRATEGY_PLAYBOOKS: StrategyPlaybook[] = [
  ...ETF_BB_PLAYBOOKS,
  ...CREANDO_RIQUEZAS_PLAYBOOKS,
  ...CHANNEL_OPTIONS,
  ML02_OPTIONS,
  ...FUTURES_PLAYBOOKS,
];

export function getPlaybook(id: string): StrategyPlaybook | undefined {
  return STRATEGY_PLAYBOOKS.find((p) => p.id === id);
}

export function playbookByStrategyKey(
  strategyKey: string,
): StrategyPlaybook | undefined {
  return STRATEGY_PLAYBOOKS.find((p) => p.strategyKey === strategyKey);
}

/** Human label for registry keys (E01 / CR04 / ML01 / raw name). */
export function strategyDisplayName(strategyKey: string): string {
  const pb = playbookByStrategyKey(strategyKey);
  if (pb) return `${pb.shortName} · ${pb.name.replace(/^[A-Z0-9]+\s*—\s*/, "")}`;
  return strategyKey;
}

export function scannableStrategyKeys(venue: Venue): string[] {
  return playbooksForVenue(venue)
    .filter((p) => p.deskTop5 !== false)
    .map((p) => p.strategyKey)
    .filter((k): k is string => Boolean(k));
}

const ETF_ORDER = [
  "e01",
  "e02",
  "e03",
  "e04",
  ...CR_ORDER,
  ...CH_ORDER,
  "ml02o",
] as const;

export function playbooksForVenue(venue: Venue): StrategyPlaybook[] {
  const books = STRATEGY_PLAYBOOKS.filter((p) => p.venue === venue);
  const order =
    venue === "tradeadvocate"
      ? (ML_ORDER as readonly string[])
      : (ETF_ORDER as readonly string[]);
  return [...books].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}
