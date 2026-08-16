/** Maylels ML02 — Single Candle Mitigation (Options + Futures desks). */

import type { StrategyPlaybook } from "@/lib/playbook-types";
import type { Venue } from "@/lib/types";

/**
 * Single Candle Mitigation on an HTF Order Block or imbalance (FVG)
 * (SMC style, e.g. https://www.youtube.com/watch?v=odUhiJR3ork)
 *
 * Trade thesis = mitigate the HTF zone (OB body or impulse FVG) while
 * taking prior highs/lows. Inducement is swept first; then price returns
 * into that HTF zone. The SCM candle is only the LTF entry trigger —
 * not a mid-range internal-structure trade on its own.
 */
function ml02Playbook(venue: Venue, id: string): StrategyPlaybook {
  const isFutures = venue === "tradeadvocate";
  return {
    id,
    venue,
    group: "Maylels",
    setupImage: "/brand/ml02-scm-setup.png",
    strategyKey: "ml02_single_candle_mitigation",
    preferredTimeframe: isFutures ? "15m" : "15m",
    syncTimeframes: isFutures ? ["15m", "5m", "1m"] : ["1h", "15m", "5m"],
    syncLookbackDays: 14,
    name: "Single Candle Mitigation",
    shortName: "ML02",
    markets: isFutures
      ? "Futuros LONG/SHORT · MNQ · MES · 6E · 6A · 6B · GC · OB/FVG HTF 15m + SCM 1m/3m"
      : "Opciones CALL/PUT · OB/FVG HTF 15m/1H + SCM LTF · plan ≤35%",
    summary:
      "Mitigar zona HTF: Order Block o imbalance (FVG) del impulso del BOS, " +
      "llevándose máximos/mínimos previos. " +
      "Bias + marcar OB/FVG HTF · barrer inducement · precio vuelve a la zona · " +
      "SCM = mecha larga que toma liquidez previa y cierra de rechazo. " +
      "SCM sola a mitad de rango / sin zona HTF = no trade.",
    sessionWindow: isFutures
      ? "Intradía · OB/FVG / bias 15m · SCM entrada 1m–3m"
      : "Intradía · OB/FVG / bias 15m/1H · SCM 5m–15m · options plan ≤35%",
    riskNotes: [
      "Tesis = mitigación HTF (OB o FVG) + toma de liquidez previa — no pullback suelto",
      "Bias HTF (BOS / momentum) alineado con el lado de la zona",
      "Marcar OB HTF y/o imbalance (FVG) del impulso del BOS",
      "Inducement o engineering liquidity barrido ANTES del return a la zona",
      "SCM válida en OB o FVG HTF: mecha larga + sweep de máximos/mínimos previos + close back",
      "SL más allá del wick SCM / zona; TP a estructura HTF opuesta",
      "Stacking: nueva SCM en la misma zona tras nuevo inducement",
      ...(isFutures
        ? []
        : ["Options: ATM/OTM en rango · plan 10/20/35% — no plan 100%"]),
    ],
    invalidation: [
      "SCM a mitad de rango sin OB/FVG HTF marcado",
      "Entrar en zona HTF sin inducement previo (trap típico)",
      "Operar contra BOS / bias HTF",
      "Vela que no barre máximos/mínimos previos (no toma liquidez)",
      "Body que cierra a través de la zona / SCM en contra",
      "Chase fuera del OB/FVG HTF",
    ],
    entrySteps: [
      {
        id: `${id}-e1`,
        label: "Bias HTF + marcar OB / FVG HTF",
        detail: isFutures
          ? "SELL: BOS bajista → OB oferta y/o FVG bearish del impulso. BUY: BOS alcista → OB demanda y/o FVG bullish."
          : "PUT: BOS bajista → OB/FVG oferta. CALL: BOS alcista → OB/FVG demanda (15m/1H).",
      },
      {
        id: `${id}-e2`,
        label: "Esperar inducement / eng. liquidity",
        detail:
          "No entrar en el primer OB intermedio del pullback — primero barrido de inducement, luego return a OB o FVG HTF.",
      },
      {
        id: `${id}-e3`,
        label: "Precio vuelve a OB o imbalance HTF",
        detail:
          "La mitigación de la zona HTF (OB body o FVG) es el trade. Sin tocar la zona → no setup.",
      },
      {
        id: `${id}-e4`,
        label: "SCM toma máximos/mínimos previos",
        detail:
          "Mecha larga barre highs/lows recientes y cierra de rechazo dentro/en el borde de la zona HTF. Color irrelevante.",
      },
      {
        id: `${id}-e5`,
        label: "Entrada · SL · TP",
        detail: isFutures
          ? "Entrada en rechazo SCM. SL más allá zona/SCM. TP1 liquidez interna · TP2 low/high HTF."
          : "Entrada en rechazo SCM. SL más allá zona/SCM. Options plan ≤35% · TP swing HTF.",
      },
    ],
    exitSteps: [
      {
        id: `${id}-x1`,
        label: "TP1: liquidez / swing interno LTF",
      },
      {
        id: `${id}-x2`,
        label: "TP2: estructura HTF (low/high del bias)",
      },
      {
        id: `${id}-x3`,
        label: "BE / salir si body cierra a través de la zona / SCM en contra",
      },
      {
        id: `${id}-x4`,
        label: "Sin return limpio al OB/FVG HTF → paper / no trade",
      },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Bias + OB/FVG HTF (tesis)",
        steps: [
          {
            id: `${id}-htf-1`,
            label: "BOS / momentum HTF = dirección",
          },
          {
            id: `${id}-htf-2`,
            label: "Marcar OB y/o FVG del impulso del BOS",
          },
          {
            id: `${id}-htf-3`,
            label: "Inducement primero; zonas mid sin tesis HTF = traps",
          },
        ],
      },
      {
        timeframe: isFutures ? "1m / 3m" : "5m / 15m",
        focus: "SCM en OB/FVG (trigger)",
        steps: [
          {
            id: `${id}-ltf-1`,
            label: "Confirmar precio dentro / en borde de OB o FVG HTF",
          },
          {
            id: `${id}-ltf-2`,
            label: "SCM: mecha larga + toma highs/lows previos + close back",
          },
          {
            id: `${id}-ltf-3`,
            label: "Entrada + SL; stack solo si nueva SCM sigue en la zona",
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
