/** Maylels ML03 — Primera vela NY 5m (regla de la primera vela). */

import type { StrategyPlaybook } from "@/lib/playbook-types";

/**
 * Based on: https://www.youtube.com/shorts/C_b78XewT9k
 * Mark 09:30–09:35 ET 5m high/low → 1m FVG break → retest engulfing.
 */
export const ML03_FUTURES: StrategyPlaybook = {
  id: "ml03",
  venue: "tradeadvocate",
  group: "Maylels",
  strategyKey: "ml03_first_ny5m",
  preferredTimeframe: "5m",
  syncTimeframes: ["5m", "1m"],
  syncLookbackDays: 10,
  name: "Primera vela NY 5m",
  shortName: "ML03",
  markets: "Futuros LONG/SHORT · MNQ · MES · GC · primera 5m NY + entrada 1m",
  summary:
    "Regla de la primera vela: a las 9:30 ET en 5m esperas el cierre 9:30–9:35, " +
    "marcas high/low del día. En 1m no entras al toque — necesitas ruptura del nivel " +
    "con FVG (gap entre mechas), retest del FVG y vela envolvente. RR ≈ 1:3 a 1:5.",
  sessionWindow: "RTH · niveles 5m 9:30–9:35 · trigger 1m después de 9:35",
  riskNotes: [
    "Solo niveles de la primera vela 5m de NY (9:30–9:35 ET)",
    "No entrar al primer toque del high/low — esperar FVG de ruptura",
    "FVG = gap entre mechas (no basta mecha o cierre suelto)",
    "Entrada en retest del FVG + vela envolvente",
    "SL más allá del engulfing / FVG; TP 1:3–1:5 R",
  ],
  invalidation: [
    "Entrar al primer toque del high/low sin FVG",
    "Operar antes del cierre de la primera 5m",
    "FVG ausente (solo mecha a través del nivel)",
    "Retest sin envolvente",
    "Chase lejos del FVG",
  ],
  entrySteps: [
    {
      id: "ml03-e1",
      label: "9:30 ET · gráfica 5m",
      detail: "Esperar cierre de la vela 9:30–9:35. Marcar high y low — únicos niveles clave del día.",
    },
    {
      id: "ml03-e2",
      label: "Bajar a 1m",
      detail: "Buscar aproximación a high (longs) o low (shorts) de esa primera vela.",
    },
    {
      id: "ml03-e3",
      label: "Ruptura + FVG (gap entre mechas)",
      detail:
        "El precio debe romper el nivel y dejar imbalance / gap entre mechas — no solo mecha o cierre.",
    },
    {
      id: "ml03-e4",
      label: "Retest FVG + vela envolvente",
      detail: "Al retestear el FVG, esperar envolvente y entrar. RR ≈ 1:3 a 1:5.",
    },
  ],
  exitSteps: [
    { id: "ml03-x1", label: "TP en 1:3–1:5 R (o estructura del día)" },
    { id: "ml03-x2", label: "SL más allá del engulfing / extremo del FVG" },
    { id: "ml03-x3", label: "Flat a cierre RTH si sigue abierta" },
  ],
  byTimeframe: [
    {
      timeframe: "5m",
      focus: "Primera vela NY (tesis)",
      steps: [
        { id: "ml03-5-1", label: "Marcar high/low 9:30–9:35 ET" },
        { id: "ml03-5-2", label: "No operar dentro de esa vela — esperar cierre" },
      ],
    },
    {
      timeframe: "1m",
      focus: "FVG + engulfing (trigger)",
      steps: [
        { id: "ml03-1-1", label: "Ruptura del nivel con gap entre mechas" },
        { id: "ml03-1-2", label: "Retest FVG + envolvente → entrada" },
      ],
    },
  ],
};
