/** Creando Riquezas (Alejandro Cardona) — CALL/PUT playbooks from seminar notes. */

import type { StrategyPlaybook } from "@/lib/playbook-types";

/** Shared exit rules taught in “Cuándo vender”. */
const CR_EXIT = [
  {
    id: "cr-x1",
    label: "Tomar utilidad (criterio propio o 100%+)",
    detail: "El mercado se la puede quitar — no esperes la expiración.",
  },
  {
    id: "cr-x2",
    label: "Set limit al ~2× al entrar (sugerido al empezar)",
    detail: "Ej. compré a 0.80 → limit sell 1.60.",
  },
  {
    id: "cr-x3",
    label: "Tras ruptura de canal: hold 2–4 días si abre verde",
    detail: "Si al día siguiente abre ROJA con utilidad → vender (cansancio).",
  },
  {
    id: "cr-x4",
    label: "Trazar piso del gap/día y vender si vela roja lo rompe",
  },
  {
    id: "cr-x5",
    label: "Nunca dejar vencer — sell close (market si ya pasó apertura)",
  },
] as const;

const OPT_RULES = [
  "Expiración ~1 semana (rápido). Jue/Vie → viernes siguiente",
  "SPY: Lun/Mié/Vie — no comprar same-day por error",
  "Strike OTM en rango rentable (SPY 0.25–0.30 · AAPL/META 0.45–0.80)",
  "Nunca comprar vela en formación — esperar cierre de vela Hora",
  "Volume + velas verdes/rojas sólidas",
];

export const CREANDO_RIQUEZAS_PLAYBOOKS: StrategyPlaybook[] = [
  {
    id: "cr01",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr01-ma40-bounce.png",
    strategyKey: "cr01_ma40_bounce",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 15,
    name: "CR01 — Promedio móvil 40 (CALL)",
    shortName: "CR01",
    markets: "Opciones CALL · Hora · MA20/MA40 + trendline",
    summary:
      "Creando Riquezas: caída hacia MA40 con MA20 encima de MA40. Traza línea bajista; CALL cuando rompe el techo de esa línea.",
    sessionWindow: "Hora · entrada tras ruptura (típicamente ≥11:00)",
    riskNotes: [...OPT_RULES, "Si el precio atraviesa MA40 y sigue bajando → no es CR01 (pasa a CR02)"],
    invalidation: [
      "MA20 no está encima de MA40",
      "Sin caída hacia / toque de MA40",
      "Compra dentro del canal sin ruptura del techo",
      "Vela incompleta / hanger sin confirmación",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr01-e1",
        label: "Contexto: MA20 encima de MA40 (zona relativa barata tras caída)",
      },
      {
        id: "cr01-e2",
        label: "Esperar caída que se acerque o toque MA40",
      },
      {
        id: "cr01-e3",
        label: "Trazar trendline bajista sobre la caída",
      },
      {
        id: "cr01-e4",
        label: "CALL al romper el techo de la línea (vela Hora completa)",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Setup + entrada",
        steps: [
          { id: "cr01-h1", label: "Panel MA20 / MA40" },
          { id: "cr01-h2", label: "Toque MA40 + ruptura trendline" },
        ],
      },
    ],
  },

  {
    id: "cr02",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr02-drop-green.png",
    strategyKey: "cr02_drop_green",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 12,
    name: "CR02 — Caída normal / fuerte (CALL)",
    shortName: "CR02",
    markets: "Opciones CALL · Hora · trendline tras caída profunda",
    summary:
      "Creando Riquezas: caída fuerte que atraviesa MA40. Seguir trazando la línea bajista hasta la primera vela verde sólida → CALL.",
    sessionWindow: "Hora · tras primera vela verde de confirmación",
    riskNotes: [...OPT_RULES, "Distinto de CR01: aquí el precio ya pasó MA40 hacia abajo"],
    invalidation: [
      "Caída sin trendline clara",
      "Entrar en vela roja / en formación",
      "Primera “verde” es hanger → esperar siguiente",
      "FED / earnings hoy",
    ],
    entrySteps: [
      { id: "cr02-e1", label: "Marco Hora: caída normal o fuerte (oportunidad)" },
      {
        id: "cr02-e2",
        label: "Si toca MA40 y sigue bajando → no usar CR01; seguir la línea",
      },
      {
        id: "cr02-e3",
        label: "Mantener trendline hasta vela verde sólida",
      },
      {
        id: "cr02-e4",
        label: "CALL al cierre de esa vela verde (Hora completa)",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Caída → primera verde",
        steps: [
          { id: "cr02-h1", label: "Trendline sobre la caída" },
          { id: "cr02-h2", label: "Entrar solo con verde clara" },
        ],
      },
    ],
  },

  {
    id: "cr03",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr03-channel-break.png",
    strategyKey: "cr03_channel_break",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 12,
    name: "CR03 — Ruptura canal bajista / lateral (CALL)",
    shortName: "CR03",
    markets: "Opciones CALL · Hora · canal (≥2 toques)",
    summary:
      "Creando Riquezas: canal bajista/lateral con MA cruzadas. NO comprar CALL dentro. CALL solo al romper el techo del canal (suele subir 2–4 días).",
    sessionWindow: "Hora · ruptura del techo (mejor ≥11:00)",
    riskNotes: [
      ...OPT_RULES,
      "REGLA DE ORO: no CALL dentro del canal bajista aunque haya verdes",
      "Mejor trade CALL de la academia según checklist diario",
    ],
    invalidation: [
      "Compra CALL dentro del canal",
      "Canal sin ≥2 puntos / sin techo claro",
      "Ruptura con vela débil / incompleta",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr03-e1",
        label: "Identificar canal bajista o lateral (≥2 toques techo/piso)",
      },
      {
        id: "cr03-e2",
        label: "MA20/MA40 cruzadas — verdes dentro = sin fuerza",
      },
      {
        id: "cr03-e3",
        label: "Esperar ruptura del TECHO del canal (vela Hora)",
      },
      {
        id: "cr03-e4",
        label: "CALL en la ruptura — hold posible 2–4 días",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Canal → ruptura",
        steps: [
          { id: "cr03-h1", label: "Dibujar techo y piso" },
          { id: "cr03-h2", label: "Entrar solo fuera del techo" },
        ],
      },
    ],
  },

  {
    id: "cr04",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr04-gap-up-green.png",
    strategyKey: "cr04_gap_up_green",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 8,
    name: "CR04 — Gap normal al alza (CALL)",
    shortName: "CR04",
    markets: "Opciones CALL · Pre-market gap + 2 velas Hora verdes",
    summary:
      "Creando Riquezas: gap alcista (pre-market 7–9:30). CALL con SALTO + VERDE + VERDE (típicamente 10:00 y 11:00). Falso gap = segunda vela roja → no entrar.",
    sessionWindow: "Hora · compra típica ~11:00 tras 2 verdes",
    riskNotes: [
      ...OPT_RULES,
      "Si el gap coincide con ruptura de canal (CR03) = setup fuerte",
      "NO CALL dentro de canal bajista solo por gap pequeño sin 2 verdes",
    ],
    invalidation: [
      "Falso gap: verde luego roja",
      "Solo una vela verde",
      "Primera vela hanger y segunda no confirma verde",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr04-e1",
        label: "Detectar GAP al alza en pre-market / apertura",
      },
      {
        id: "cr04-e2",
        label: "1.ª vela Hora alcista (verde o martillo alcista — no hanger)",
        detail: "Ventana 9:30–10:00.",
      },
      {
        id: "cr04-e3",
        label: "2.ª vela Hora verde obligatoria (~11:00)",
      },
      {
        id: "cr04-e4",
        label: "CALL en la 2.ª verde — SALTO + VERDE + VERDE",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Pre-market",
        focus: "Detectar gap",
        steps: [{ id: "cr04-pm1", label: "Cierre ayer vs open hoy (salto)" }],
      },
      {
        timeframe: "Hora",
        focus: "Confirmación 2 verdes",
        steps: [
          { id: "cr04-h1", label: "10:00 alcista" },
          { id: "cr04-h2", label: "11:00 verde → CALL" },
        ],
      },
    ],
  },

  {
    id: "cr05",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr05-gap-down-green.png",
    strategyKey: "cr05_gap_down_green",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 8,
    name: "CR05 — Gap bajista al alza (CALL)",
    shortName: "CR05",
    markets: "Opciones CALL · Gap down + 2 verdes Hora (excepción al canal)",
    summary:
      "Creando Riquezas: abre abajo (gap bajista) y vienen dos velas verdes sólidas → CALL. Excepción: se puede comprar incluso dentro de canal bajista (señal temprana de fin de canal).",
    sessionWindow: "Hora · tras 2 verdes; si hanger esperar ~12:00",
    riskNotes: [
      ...OPT_RULES,
      "Única excepción explícita para CALL dentro de canal",
      "A menudo el día siguiente da CR03 (ruptura de techo) — estar atento",
    ],
    invalidation: [
      "Sin dos verdes claras tras el gap down",
      "Segunda vela hanger sin tercera verde de confirmación",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr05-e1",
        label: "Gap bajista: cierra positivo ayer / abre abajo hoy (o salto down)",
      },
      {
        id: "cr05-e2",
        label: "Dos primeras velas Hora verdes bien definidas",
      },
      {
        id: "cr05-e3",
        label: "Si hay hanger → esperar siguiente verde (~12:00)",
      },
      {
        id: "cr05-e4",
        label: "CALL — válido incluso dentro de canal bajista",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Gap down → 2 verdes",
        steps: [
          { id: "cr05-h1", label: "Confirmar gap / apertura débil" },
          { id: "cr05-h2", label: "Verde + verde → CALL" },
        ],
      },
    ],
  },

  {
    id: "cr06",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr06-strong-floor.png",
    strategyKey: "cr06_strong_floor",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h", "1d"],
    syncLookbackDays: 120,
    name: "CR06 — Piso fuerte MA100/200 (CALL)",
    shortName: "CR06",
    markets: "Opciones CALL · Diario MA100/200 + Hora ruptura canal",
    summary:
      "Creando Riquezas: en Diario, precio cerca/toca MA100 o MA200 (piso fuerte, ~cada 8–12 semanas). En Hora, CALL cuando vela verde rompe techo del canal ≥11:00.",
    sessionWindow: "Multi-TF · entrada Hora ≥11:00 tras ruptura",
    riskNotes: [
      ...OPT_RULES,
      "Requiere ambos marcos: Diario (piso) + Hora (ruptura)",
      "Hold posible ~2 días tras la ruptura",
    ],
    invalidation: [
      "Sin visita clara a MA100/MA200 en Diario",
      "Ruptura Hora antes de 11:00 sin vela completa",
      "Sin techo de canal trazable en Hora",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr06-e1",
        label: "DIARIO: caída que visita / toca MA100 o MA200",
      },
      {
        id: "cr06-e2",
        label: "HORA: trazar techo del canal bajista",
      },
      {
        id: "cr06-e3",
        label: "Vela alcista verde rompe el techo ≥11:00",
      },
      {
        id: "cr06-e4",
        label: "CALL — caída + piso fuerte + ruptura techo",
      },
    ],
    exitSteps: [...CR_EXIT],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Piso fuerte",
        steps: [
          { id: "cr06-d1", label: "MA100 / MA200 como soporte" },
          { id: "cr06-d2", label: "Precio cerca o tocando tras caída" },
        ],
      },
      {
        timeframe: "Hora",
        focus: "Trigger",
        steps: [
          { id: "cr06-h1", label: "Trendline / techo canal" },
          { id: "cr06-h2", label: "Ruptura verde ≥11:00 → CALL" },
        ],
      },
    ],
  },

  {
    id: "cr07",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr07-put-channel.png",
    strategyKey: "cr07_put_channel",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 12,
    name: "CR07 — PUT en canal bajista",
    shortName: "CR07",
    markets: "Opciones PUT · Hora · canal bajista zona cara",
    summary:
      "Creando Riquezas: canal bajista + cerca del techo (zona cara / MA40) + intento verde→rojo + línea de piso bajo el rebote. PUT con vela ROJA que rompe ese piso (≥11:00).",
    sessionWindow: "Hora · PUT siempre ≥11:00",
    riskNotes: [
      ...OPT_RULES,
      "Dentro del canal bajista: PUT sí / CALL no",
      "PUT se compra con vela roja",
    ],
    invalidation: [
      "Fuera de canal bajista / lateral bajista",
      "Lejos del techo (no zona cara)",
      "Sin ruptura del piso del rebote",
      "Entrada antes de 11:00",
      "FED / earnings hoy",
    ],
    entrySteps: [
      { id: "cr07-e1", label: "Estar en canal bajista (Hora)" },
      {
        id: "cr07-e2",
        label: "Cerca del techo / zona cara (y cerca MA40)",
      },
      {
        id: "cr07-e3",
        label: "Patrón verde→rojo / hanger en la zona alta",
      },
      {
        id: "cr07-e4",
        label: "Trazar piso bajo la subida; PUT al romperlo con vela roja ≥11:00",
      },
    ],
    exitSteps: [
      {
        id: "cr07-x1",
        label: "Vender PUT cuando se encarece con la caída (mismo día / día siguiente)",
      },
      ...CR_EXIT.filter((x) => x.id !== "cr-x3"),
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "4 condiciones PUT",
        steps: [
          { id: "cr07-h1", label: "Canal + techo caro" },
          { id: "cr07-h2", label: "Ruptura piso del rebote con roja" },
        ],
      },
    ],
  },

  {
    id: "cr08",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    setupImage: "/brand/cr08-first-red.png",
    strategyKey: "cr08_first_red",
    preferredTimeframe: "30m",
    syncTimeframes: ["30m", "1d"],
    syncLookbackDays: 60,
    name: "CR08 — Primera vela roja de apertura (PUT)",
    shortName: "CR08",
    markets: "Opciones PUT · Única estrategia a las 10:00",
    summary:
      "Creando Riquezas: primera media hora 9:30–10:00 ROJA (30m) → PUT a las 10:00 (mejor en canal bajista). NO aplicar cerca de piso fuerte MA200 en Diario.",
    sessionWindow: "10:00 exacto · luego revisar otras estrategias a las 11:00",
    riskNotes: [
      ...OPT_RULES,
      "Única PUT que se compra a las 10:00",
      "Revisar Diario: cerca MA200 → skip (puede rebotar)",
      "Trades rápidos — festival de PUTs intradiarios",
    ],
    invalidation: [
      "Primera vela no es roja sólida",
      "Precio en piso fuerte Diario (MA100/200)",
      "Compra después de las 10:00 “porque sí” sin ser esta regla",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr08-e1",
        label: "DIARIO: confirmar que NO estamos en piso fuerte MA200",
      },
      {
        id: "cr08-e2",
        label: "HORA: preferible dentro de canal bajista",
      },
      {
        id: "cr08-e3",
        label: "1.ª vela 9:30–10:00 ROJA completa",
      },
      {
        id: "cr08-e4",
        label: "PUT a las 10:00 — salir cuando cae / limit 2×",
      },
    ],
    exitSteps: [
      {
        id: "cr08-x1",
        label: "Trade rápido: vender en la caída del mismo día",
      },
      {
        id: "cr08-x2",
        label: "Limit ~2× al entrar",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Filtro piso fuerte",
        steps: [{ id: "cr08-d1", label: "¿Cerca MA200? → no CR08" }],
      },
      {
        timeframe: "Hora",
        focus: "10:00",
        steps: [
          { id: "cr08-h1", label: "Cierre 1.ª vela roja" },
          { id: "cr08-h2", label: "PUT inmediato" },
        ],
      },
    ],
  },

  {
    id: "cr09",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    strategyKey: "cr09_gap_floor_put",
    preferredTimeframe: "1h",
    syncTimeframes: ["1h"],
    syncLookbackDays: 8,
    name: "CR09 — Ruptura del piso del gap (PUT)",
    shortName: "CR09",
    markets: "Opciones PUT · Gap up o down + ruptura piso",
    summary:
      "Creando Riquezas: hay gap (alza o baja). Traza el piso del gap; PUT cuando vela ROJA lo rompe (≥11:00). Si a las 10:00 ya es roja → usar CR08.",
    sessionWindow: "Marcar piso a las 10:00 · PUT típico ≥11:00",
    riskNotes: [
      ...OPT_RULES,
      "No importa dirección del gap — importa romper el piso",
      "A las 10:00 solo trazas; esperas la roja de ruptura",
    ],
    invalidation: [
      "Sin gap / sin piso trazable",
      "Ruptura con vela incompleta",
      "Entrada <11:00 salvo que sea CR08",
      "FED / earnings hoy",
    ],
    entrySteps: [
      { id: "cr09-e1", label: "Identificar GAP (alza o baja)" },
      {
        id: "cr09-e2",
        label: "Trazar línea de piso del gap (~10:00 OK para marcar)",
      },
      {
        id: "cr09-e3",
        label: "Esperar vela ROJA que rompa el piso (≥11:00)",
      },
      {
        id: "cr09-e4",
        label: "PUT en esa vela roja",
      },
    ],
    exitSteps: [
      {
        id: "cr09-x1",
        label: "Vender en la continuación bajista / limit 2×",
      },
      ...CR_EXIT.filter((x) => !["cr-x3"].includes(x.id)),
    ],
    byTimeframe: [
      {
        timeframe: "Hora",
        focus: "Piso del gap",
        steps: [
          { id: "cr09-h1", label: "Marcar piso" },
          { id: "cr09-h2", label: "Roja rompe → PUT" },
        ],
      },
    ],
  },

  {
    id: "cr10",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    strategyKey: "cr10_daily_hanger",
    preferredTimeframe: "1d",
    syncTimeframes: ["1d"],
    syncLookbackDays: 40,
    name: "CR10 — Hanger diario (PUT)",
    shortName: "CR10",
    markets: "Opciones PUT · Diario · late day ~15:55",
    summary:
      "Creando Riquezas: hanger en marco Diario (cola larga arriba, cuerpo pequeño; verde o roja). Mejor en zona cara. PUT cerca del cierre (~15:55; SPY ~16:13) cuando la vela ya está formada.",
    sessionWindow: "Tarde · ~15:55–16:13 · solo Diario",
    riskNotes: [
      ...OPT_RULES,
      "Alejandro: menos frecuente / menos fuerza reciente — selectivo",
      "Hangers temporales: esperar formación casi completa",
    ],
    invalidation: [
      "No es hanger claro (sin cola superior dominante)",
      "Zona barata / piso fuerte (preferir zona cara)",
      "Comprar a media tarde con vela aún inestable",
      "FED / earnings hoy",
    ],
    entrySteps: [
      {
        id: "cr10-e1",
        label: "DIARIO: buscar hanger (mecha larga arriba + cuerpo pequeño)",
      },
      { id: "cr10-e2", label: "Preferir zona cara / techos" },
      {
        id: "cr10-e3",
        label: "Esperar casi cierre (~15:55 / SPY ~16:13)",
      },
      { id: "cr10-e4", label: "PUT al confirmarse el hanger" },
    ],
    exitSteps: [
      {
        id: "cr10-x1",
        label: "Vender en la caída del día siguiente / limit 2×",
      },
      {
        id: "cr10-x2",
        label: "Si abre fuerte al alza → salir rápido",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Único marco",
        steps: [
          { id: "cr10-d1", label: "Forma hanger en zona cara" },
          { id: "cr10-d2", label: "Entrada late day" },
        ],
      },
    ],
  },

  {
    id: "cr11",
    venue: "schwab",
    group: "Creando Riquezas · CR01–CR11",
    strategyKey: "cr11_earnings_floor",
    preferredTimeframe: "1d",
    syncTimeframes: ["1d"],
    syncLookbackDays: 90,
    name: "CR11 — Modelo earnings (alto riesgo)",
    shortName: "CR11",
    markets: "Opciones CALL/PUT · pre-earnings ~15:55 · OptionSlam stats",
    summary:
      "Creando Riquezas: modelo de altísimo riesgo. Preferible NO operar en semana de earnings y esperar post-earnings (gap + CR04/CR05/…). Si se usa: caída + piso fuerte Diario + stats OptionSlam + strike ~5–6% / rango de prima rentable.",
    sessionWindow: "Pre-cierre ~15:55 día del reporte · o skip y operar post",
    riskNotes: [
      "ALTÍSIMO RIESGO — Alejandro recomienda esperar al día siguiente",
      "Post-earnings (gap + estrategias normales) suele ser mejor",
      "Options se encarecen en semana de earnings",
      ...OPT_RULES,
    ],
    invalidation: [
      "Stats OptionSlam no favorecen el movimiento proyectado",
      "Strike necesita >~10% para estar en prima rentable",
      "Sin piso fuerte / sin caída previa",
      "Operar por FOMO sin los 4 pasos",
    ],
    entrySteps: [
      {
        id: "cr11-e1",
        label: "Acción viniendo en caída",
      },
      {
        id: "cr11-e2",
        label: "DIARIO: visitando piso fuerte MA100/MA200",
      },
      {
        id: "cr11-e3",
        label: "OptionSlam: % subidas/bajadas últimos reportes",
        detail: "Si movimientos históricos <~6% típicos → expectativa baja.",
      },
      {
        id: "cr11-e4",
        label: "~15:55: proyectar +5/+7/+10% y elegir strike cercano a ~5–6%",
      },
      {
        id: "cr11-e5",
        label: "Preferir: no comprar — esperar open post-earnings y aplicar CR04–CR09",
      },
    ],
    exitSteps: [
      {
        id: "cr11-x1",
        label: "Si entraste pre-report: gestionar en apertura (market si ya movió)",
      },
      {
        id: "cr11-x2",
        label: "Si skip: operar solo setups CR clásicos al día siguiente",
      },
    ],
    byTimeframe: [
      {
        timeframe: "Día",
        focus: "Filtros pre-earnings",
        steps: [
          { id: "cr11-d1", label: "Caída + MA100/200" },
          { id: "cr11-d2", label: "Stats OptionSlam" },
        ],
      },
      {
        timeframe: "Post",
        focus: "Preferido",
        steps: [
          { id: "cr11-p1", label: "Ver gap / CR04–CR09 al open" },
        ],
      },
    ],
  },
];

export const CR_ORDER = [
  "cr01",
  "cr02",
  "cr03",
  "cr04",
  "cr05",
  "cr06",
  "cr07",
  "cr08",
  "cr09",
  "cr10",
  "cr11",
] as const;
