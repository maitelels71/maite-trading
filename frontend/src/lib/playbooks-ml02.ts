/** Maylels ML02 — Single Candle Mitigation (Options + Futures desks). */

import type { StrategyPlaybook } from "@/lib/playbook-types";
import type { Venue } from "@/lib/types";

/**
 * Single Candle Mitigation on an HTF Order Block
 * (SMC style, e.g. https://www.youtube.com/watch?v=odUhiJR3ork)
 *
 * Trade thesis = mitigate the HTF OB (supply/demand from the impulse
 * that caused the HTF BOS). Inducement is swept first; then price returns
 * into that HTF OB. The SCM candle is only the LTF entry trigger inside
 * the OB — not a mid-range internal-structure trade on its own.
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
      ? "Futuros LONG/SHORT · MNQ · MES · 6E · 6A · 6B · GC · OB HTF 15m + SCM 1m/3m"
      : "Opciones CALL/PUT · OB HTF 15m/1H + SCM LTF · plan ≤35%",
    summary:
      "Mitigar el Order Block HTF (oferta/demanda del impulso del BOS). " +
      "Primero bias + marcar OB HTF · barrer inducement · precio vuelve al OB · " +
      "SCM dentro del OB = trigger de entrada (barre extremo de la vela previa y cierra de vuelta). " +
      "SCM sola a mitad de rango / sin OB HTF = no trade. Color de vela no importa.",
    sessionWindow: isFutures
      ? "Intradía · OB / bias 15m · SCM entrada 1m–3m"
      : "Intradía · OB / bias 15m/1H · SCM 5m–15m · options plan ≤35%",
    riskNotes: [
      "Tesis = mitigación del OB HTF — no un pullback interno suelto",
      "Bias HTF (BOS / momentum) alineado con el lado del OB",
      "Marcar OB HTF: última zona de impulso antes del BOS (oferta sell / demanda buy)",
      "Inducement o engineering liquidity barrido ANTES de aceptar el return al OB",
      "SCM válida solo DENTRO / en el borde del OB HTF: sweep vela previa + close back",
      "SL más allá del OB / wick SCM; TP a estructura HTF opuesta",
      "Stacking: nueva SCM en el mismo OB (o OB extremo) tras nuevo inducement",
      ...(isFutures
        ? []
        : ["Options: ATM/OTM en rango · plan 10/20/35% — no plan 100%"]),
    ],
    invalidation: [
      "SCM a mitad de rango sin OB HTF marcado (estructura interna sola)",
      "Entrar en OB HTF sin inducement previo (trap típico)",
      "Operar contra BOS / bias HTF",
      "Vela que no barre el extremo de la previa (no es SCM)",
      "Body que cierra a través del OB / SCM en contra",
      "Chase fuera del OB HTF",
    ],
    entrySteps: [
      {
        id: `${id}-e1`,
        label: "Bias HTF + marcar OB HTF",
        detail: isFutures
          ? "SELL: BOS bajista → OB oferta (último impulso alcista antes del BOS). BUY: BOS alcista → OB demanda."
          : "PUT: BOS bajista → OB oferta. CALL: BOS alcista → OB demanda (15m/1H).",
      },
      {
        id: `${id}-e2`,
        label: "Esperar inducement / eng. liquidity",
        detail:
          "No entrar en el primer OB intermedio del pullback — primero barrido de inducement, luego return al OB HTF.",
      },
      {
        id: `${id}-e3`,
        label: "Precio vuelve al OB HTF",
        detail:
          "La mitigación del OB HTF es el trade. Sin tocar el OB → no setup.",
      },
      {
        id: `${id}-e4`,
        label: "SCM dentro del OB (trigger)",
        detail:
          "SELL: barre high de la previa y cierra debajo. BUY: barre low previo y cierra arriba. Color irrelevante.",
      },
      {
        id: `${id}-e5`,
        label: "Entrada · SL · TP",
        detail: isFutures
          ? "Entrada en rechazo SCM. SL más allá OB/SCM. TP1 liquidez interna · TP2 low/high HTF."
          : "Entrada en rechazo SCM. SL más allá OB/SCM. Options plan ≤35% · TP swing HTF.",
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
        label: "BE / salir si body cierra a través del OB / SCM en contra",
      },
      {
        id: `${id}-x4`,
        label: "Sin return limpio al OB HTF → paper / no trade",
      },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Bias + OB HTF (tesis)",
        steps: [
          {
            id: `${id}-htf-1`,
            label: "BOS / momentum HTF = dirección",
          },
          {
            id: `${id}-htf-2`,
            label: "Marcar OB HTF (oferta/demanda del impulso del BOS)",
          },
          {
            id: `${id}-htf-3`,
            label: "Inducement primero; OBs mid sin OB HTF = traps",
          },
        ],
      },
      {
        timeframe: isFutures ? "1m / 3m" : "5m / 15m",
        focus: "SCM en el OB (trigger)",
        steps: [
          {
            id: `${id}-ltf-1`,
            label: "Confirmar precio dentro / en borde del OB HTF",
          },
          {
            id: `${id}-ltf-2`,
            label: "SCM: sweep vela previa + close back",
          },
          {
            id: `${id}-ltf-3`,
            label: "Entrada + SL; stack solo si nueva SCM sigue en el OB",
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
