/** Futures playbooks — Maylels desk (Schwab candles). */

import type { StrategyPlaybook } from "@/lib/playbook-types";

/**
 * ML01 — MNQ 3m pullback real: ChoCh + BOS (zonas HTF).
 * ChoCh = alerta · BOS = confirmación · sin BOS no entrar.
 */
export const FUTURES_PLAYBOOKS: StrategyPlaybook[] = [
  {
    id: "ml01",
    venue: "tradeadvocate",
    group: "Maylels",
    setupImage: "/brand/ml01-mnq-setup.png",
    strategyKey: "ml01_structure_choch_bos",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h", "5m", "1m"],
    syncLookbackDays: 20,
    name: "Estructura ChoCh + BOS",
    shortName: "ML01",
    markets: "Futuros LONG/SHORT · NQ/MNQ · ES/MES · zonas HTF + entrada 3m",
    summary:
      "Pullback real en zona HTF (15m/1H). ChoCh = alerta; BOS = confirmación de entrada. COMPRA en demanda HTF · VENTA en oferta tras ruptura. Sin BOS no entrar.",
    sessionWindow: "Intradía · zonas 15m/1H · confirmación/entrada en 3m",
    riskNotes: [
      "Zonas HTF = dónde buscar el pullback",
      "ChoCh = alerta · BOS = confirmación — sin BOS no entrar",
      "COMPRA: pullback a demanda HTF → ChoCh alcista → BOS al upside",
      "VENTA: pullback a oferta HTF → ChoCh bajista → BOS al downside",
      "SL detrás de la zona / swing del setup; TP a liquidez / zona opuesta",
    ],
    invalidation: [
      "Entrar solo con ChoCh (falta BOS)",
      "Chase fuera de la zona HTF válida",
      "Operar pullback sin zona de demanda/oferta HTF",
      "Ignorar invalidación si se rompe la zona en contra",
    ],
    entrySteps: [
      {
        id: "ml01-e1",
        label: "Marcar zona HTF (15m / 1H)",
        detail:
          "COMPRA: demanda. VENTA: oferta (p.ej. zona 15m rota → oferta).",
      },
      {
        id: "ml01-e2",
        label: "Esperar pullback real a la zona",
        detail: "Precio dentro de la zona — no chase.",
      },
      {
        id: "ml01-e3",
        label: "3m — ChoCh (alerta)",
        detail: "Cambio de carácter a favor. Aún NO entrar.",
      },
      {
        id: "ml01-e4",
        label: "3m — BOS (confirmación)",
        detail: "Ruptura de estructura. Entrada tras BOS.",
      },
      {
        id: "ml01-e5",
        label: "Definir Entrada / SL / TP",
        detail:
          "SL detrás de la zona/swing. TP a liquidez previa o zona HTF opuesta.",
      },
    ],
    exitSteps: [
      { id: "ml01-x1", label: "TP1: liquidez / swing previo en 3m–15m" },
      { id: "ml01-x2", label: "TP2: zona HTF opuesta si el path sigue limpio" },
      { id: "ml01-x3", label: "Salir si se rompe la zona del setup en contra" },
      { id: "ml01-x4", label: "Sin BOS limpio → no trade / paper" },
    ],
    byTimeframe: [
      {
        timeframe: "15m / 1H",
        focus: "Zonas — dónde buscar",
        steps: [
          { id: "ml01-htf-1", label: "Marcar demanda / oferta HTF" },
          { id: "ml01-htf-2", label: "Pullback debe llegar a esa zona" },
          { id: "ml01-htf-3", label: "Sin zona válida → no setup" },
        ],
      },
      {
        timeframe: "3m",
        focus: "ChoCh + BOS",
        steps: [
          { id: "ml01-3-1", label: "ChoCh en zona = alerta" },
          { id: "ml01-3-2", label: "Esperar BOS (rompe el high/low clave)" },
          { id: "ml01-3-3", label: "Entrada tras BOS — sin BOS no entrar" },
        ],
      },
    ],
  },
];

export const ML_ORDER = ["ml01"] as const;
