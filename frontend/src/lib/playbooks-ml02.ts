/** Maylels ML02 — H4 bias → 15M confirm + PD → 1M entry (Options + Futures). */

import type { StrategyPlaybook } from "@/lib/playbook-types";
import type { Venue } from "@/lib/types";

/**
 * Multi-timeframe breakout with premium/discount filter.
 * H4 sets bias (3-candle breakout). 15M and 1M must confirm the same
 * direction and sit in Discount (LONG) or Premium (SHORT). Confidence ≥ 90.
 */
function ml02Playbook(venue: Venue, id: string): StrategyPlaybook {
  const isFutures = venue === "tradeadvocate";
  return {
    id,
    venue,
    group: "Maylels",
    strategyKey: "ml02_h4_15m_1m",
    preferredTimeframe: "4h",
    syncTimeframes: ["4h", "15m", "1m"],
    syncLookbackDays: 30,
    name: "H4 → 15M → 1M",
    shortName: "ML02",
    markets: isFutures
      ? "Futuros LONG/SHORT · MNQ · MES · 6E · 6A · 6B · GC · H4 bias + 15M/1M + PD"
      : "Opciones CALL/PUT · H4 bias + 15M/1M + PD · plan ≤35%",
    summary:
      "Bias H4 (ruptura de las 3 velas previas + close a favor). " +
      "15M confirma misma dirección y Premium/Discount. " +
      "1M confirma + PD para entrada. " +
      "LONG solo en Discount · SHORT solo en Premium · confianza ≥ 90.",
    sessionWindow: isFutures
      ? "Intradía · bias H4 · confirm 15M · entrada 1M"
      : "Intradía · bias H4 · confirm 15M · entrada 1M · options plan ≤35%",
    riskNotes: [
      "H4 NEUTRAL = no trade (sin bias)",
      "15M y 1M deben romper en la misma dirección que H4",
      "LONG solo con precio en Discount (bajo el 50% del swing)",
      "SHORT solo con precio en Premium (sobre el 50% del swing)",
      "Confianza ≥ 90 (todos los checks alineados)",
      "SL más allá del swing contrario LTF; TP a estructura H4",
      ...(isFutures
        ? []
        : ["Options: ATM/OTM en rango · plan 10/20/35% — no plan 100%"]),
    ],
    invalidation: [
      "H4 sin ruptura alcista/bajista clara (NEUTRAL)",
      "15M o 1M no confirman el bias H4",
      "LONG en Premium / SHORT en Discount",
      "Confianza < 90",
      "Operar contra el close de la vela de ruptura",
    ],
    entrySteps: [
      {
        id: `${id}-e1`,
        label: "Bias H4 — ruptura de 3 velas",
        detail: isFutures
          ? "Bull: High > max(3 H4 previas) y Close > Open. Bear: Low < min(3) y Close < Open. Si no → NEUTRAL."
          : "CALL: High > max(3 H4) + close alcista. PUT: Low < min(3) + close bajista. Si no → no trade.",
      },
      {
        id: `${id}-e2`,
        label: "15M confirma + Premium/Discount",
        detail:
          "Misma ruptura de 3 velas en 15M alineada con H4. LONG necesita Discount; SHORT Premium (eq = 50% swing).",
      },
      {
        id: `${id}-e3`,
        label: "1M confirma + PD entrada",
        detail:
          "Ruptura 1M en la misma dirección + zona PD correcta. Entrada en close / rechazo de la vela activa.",
      },
      {
        id: `${id}-e4`,
        label: "Confianza ≥ 90",
        detail:
          "Score suma bias H4, confirm 15M/1M y PD óptimo. Por debajo de 90 → WAIT.",
      },
      {
        id: `${id}-e5`,
        label: "Entrada · SL · TP",
        detail: isFutures
          ? "Entrada al confirmar 1M. SL más allá swing LTF. TP1 liquidez 15M · TP2 estructura H4."
          : "Entrada al confirmar 1M. SL más allá swing LTF. Options plan ≤35% · TP swing H4.",
      },
    ],
    exitSteps: [
      {
        id: `${id}-x1`,
        label: "TP1: liquidez / swing 15M",
      },
      {
        id: `${id}-x2`,
        label: "TP2: estructura H4 (high/low del bias)",
      },
      {
        id: `${id}-x3`,
        label: "BE / salir si H4 cierra en contra del bias",
      },
      {
        id: `${id}-x4`,
        label: "Sin alineación H4+15M+1M+PD → paper / no trade",
      },
    ],
    byTimeframe: [
      {
        timeframe: "H4",
        focus: "Bias direccional",
        steps: [
          {
            id: `${id}-htf-1`,
            label: "Comparar vela activa vs high/low de las 3 H4 previas",
          },
          {
            id: `${id}-htf-2`,
            label: "Close > Open = bull · Close < Open = bear (con ruptura)",
          },
          {
            id: `${id}-htf-3`,
            label: "NEUTRAL → no buscar 15M/1M",
          },
        ],
      },
      {
        timeframe: "15M",
        focus: "Confirmación + PD",
        steps: [
          {
            id: `${id}-m15-1`,
            label: "Ruptura 3 velas en la misma dirección que H4",
          },
          {
            id: `${id}-m15-2`,
            label: "Marcar swing → eq 50% · Discount / Premium",
          },
          {
            id: `${id}-m15-3`,
            label: "LONG solo Discount · SHORT solo Premium",
          },
        ],
      },
      {
        timeframe: "1M",
        focus: "Trigger de entrada",
        steps: [
          {
            id: `${id}-m1-1`,
            label: "Ruptura 3 velas alineada + PD correcto",
          },
          {
            id: `${id}-m1-2`,
            label: "Confianza ≥ 90 antes de entrar",
          },
          {
            id: `${id}-m1-3`,
            label: "Entrada + SL; no chase si ya salió de la zona PD",
          },
        ],
      },
    ],
  };
}

/** Futures desk */
export const ML02_FUTURES = ml02Playbook("tradeadvocate", "ml02");

/** Options desk */
export const ML02_OPTIONS = ml02Playbook("schwab", "ml02o");
