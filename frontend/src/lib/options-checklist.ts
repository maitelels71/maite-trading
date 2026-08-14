/** Investep Academy options checklist (Checklist_Opciones_Invetep_Academy.pdf). */

export type ChecklistItem = {
  id: string;
  label: string;
  hint?: string;
};

export type ChecklistSection = {
  id: string;
  title: string;
  subtitle: string;
  items: ChecklistItem[];
};

export const OPTIONS_CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "macro",
    title: "Panorama macro",
    subtitle: "Recuerda analizar el panorama completo",
    items: [
      {
        id: "oc-fed",
        label: "Reunión FED (cada ~45 días)",
        hint: "Si hay FOMC cerca → size down o stand down",
      },
      {
        id: "oc-earnings",
        label: "Earnings del ticker (cada ~3 meses)",
        hint: "No pelear earnings a ciegas — fecha en el calendario",
      },
    ],
  },
  {
    id: "structure",
    title: "Estructura de precio",
    subtitle: "Analizar HORA / DÍA antes de la entrada",
    items: [
      {
        id: "oc-ma",
        label: "Promedios móviles · techos / pisos",
        hint: "Confirma en Hora y Diario",
      },
      {
        id: "oc-trendline",
        label: "Puntos de ruptura de líneas de tendencia",
      },
      {
        id: "oc-gap-up",
        label: "Salto al alza (GAP) marcado / descartado",
      },
      {
        id: "oc-gap-down",
        label: "Salto a la baja (GAP) marcado / descartado",
      },
      {
        id: "oc-bb",
        label: "Bollinger 15m / Hora / Diario",
        hint: "Alineación del setup con el playbook",
      },
      {
        id: "oc-mid",
        label: "Punto medio Diario (resistencia / soporte)",
      },
    ],
  },
  {
    id: "option",
    title: "Contrato de opción",
    subtitle: "Prima, liquidez y plan %",
    items: [
      {
        id: "oc-bidask",
        label: "BID − ASK: spread aceptable",
        hint: "Diferencia pequeña · liquidez ok",
      },
      {
        id: "oc-range",
        label: "Prima dentro del rango óptimo del ticker",
        hint: "Sticky Notes · Rango precios / desk TOP 5 plan",
      },
      {
        id: "oc-strike",
        label: "Strike alineado al spot (ATM / plan del desk)",
      },
      {
        id: "oc-exp",
        label: "Fecha de expiración elegida",
        hint: "Jueves/viernes suelen ser más activos — confirma tu plan",
      },
      {
        id: "oc-plan",
        label: "Plan % definido: 10% / 20% / 35%",
        hint: "Toma parcial o target según tu playbook (≈ 35%)",
      },
      {
        id: "oc-size",
        label: "Nº de contratos y riesgo $ calculados",
      },
    ],
  },
];

export type OptionsTradeTicket = {
  ticker: string;
  date: string;
  bid: string;
  ask: string;
  strike: string;
  spot: string;
  distancia: string;
  exp: string;
  planPct: string;
  optionType: string;
  hour: string;
  contracts: string;
  tradePrice: string;
  pnl: string;
};

export const EMPTY_OPTIONS_TICKET: OptionsTradeTicket = {
  ticker: "",
  date: "",
  bid: "",
  ask: "",
  strike: "",
  spot: "",
  distancia: "",
  exp: "",
  planPct: "35",
  optionType: "CALL",
  hour: "",
  contracts: "",
  tradePrice: "",
  pnl: "",
};
