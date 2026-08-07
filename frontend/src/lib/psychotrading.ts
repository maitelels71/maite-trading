/** Psychotrading — ritual, mantras, quotes. */

export type MindItem = {
  id: string;
  label: string;
  hint?: string;
};

export type MindSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: MindItem[];
  footer?: string;
};

export type MantraGroup = {
  id: string;
  title: string;
  lines: string[];
};

export type Quote = {
  id: string;
  text: string;
  author?: string;
};

/** Condensed from your life mantras — short lines you can repeat. */
export const LIFE_MANTRAS: MantraGroup[] = [
  {
    id: "life",
    title: "Mantra de vida",
    lines: [
      "Prospero día y noche en todo lo que hago.",
      "El orden divino cuida mi vida.",
      "Hoy es el mejor día de mi vida.",
      "El amor divino me rodea.",
      "Elijo ser feliz todo el día.",
      "Soy imán de lo divino.",
      "Vivo la vida perfecta.",
      "La felicidad es mi hábito.",
      "Bendiciones para mi familia y mi vida.",
    ],
  },
  {
    id: "abundance",
    title: "Abundancia",
    lines: [
      "La riqueza divina circula en mi vida.",
      "La abundancia fluye hacia mí sin cesar.",
      "Mis necesidades y metas se cumplen con guía.",
      "Estoy en armonía con el bien.",
      "Soy uno con Dios, y Dios lo es todo.",
    ],
  },
];

export const TRADING_MANTRA_LINES: string[] = [
  "Hoy entreno mi cerebro para seguir mi plan sin negociar con mis emociones.",
  "Mis neuronas se fortalecen cada vez que respeto mi stop, mi tamaño y mis reglas.",
  "No necesito adivinar el mercado: ejecuto mi ventaja con precisión.",
  "Cada trade es neuroplasticidad: si repito disciplina, grabo disciplina.",
  "Acepto las pérdidas planificadas; protejo mi capital y mi mente.",
  "Mi límite de riesgo diario es sagrado — así reprogramo consistencia.",
  "Hoy solo set-ups A+, en mis horarios, sin impulsos ni venganza.",
  "Con cada sesión mi mente se vuelve más tranquila, enfocada y profesional.",
  "No persigo al mercado; dejo que el mercado venga a mis reglas.",
];

export const RITUAL_SECTIONS: MindSection[] = [
  {
    id: "before-session",
    title: "A. Antes de operar",
    subtitle: "Estado + límites del día",
    items: [
      { id: "a-rest", label: "Dormí y descansé suficiente." },
      {
        id: "a-emotion",
        label: "No estoy bajo emociones fuertes (enojo, euforia, miedo, prisa).",
      },
      {
        id: "a-accept",
        label: "Acepto que hoy puedo ganar o perder y que eso es normal.",
      },
      {
        id: "a-instruments",
        label: "Solo operaré mis instrumentos: NQ / ES / GOLD / 6E.",
      },
      { id: "a-hours", label: "Solo operaré en mis horarios definidos." },
      {
        id: "a-risk",
        label: "Riesgo por trade: máximo 0.25% de la cuenta.",
      },
      { id: "a-daily-loss", label: "Pérdida máxima diaria: $300." },
      { id: "a-max-trades", label: "Máximo de operaciones hoy: 2 trades." },
    ],
  },
  {
    id: "before-trade",
    title: "B. Antes de cada trade",
    subtitle: "Si alguna es NO → no entro",
    footer: "Si alguna respuesta es NO → NO entro.",
    items: [
      { id: "b-aplus", label: "¿Es un set-up A+ o estoy forzando?" },
      {
        id: "b-context",
        label: "El contexto está claro (tendencia, rangos, zonas clave).",
      },
      { id: "b-stop", label: "El stop está en un nivel lógico." },
      {
        id: "b-size",
        label: "El tamaño de la posición respeta mi riesgo.",
      },
      {
        id: "b-rr",
        label: "El TP respeta mi relación riesgo/beneficio.",
      },
      {
        id: "b-accept-loss",
        label: "He aceptado mentalmente la pérdida máxima de este trade.",
      },
    ],
  },
  {
    id: "during",
    title: "C. Durante el trade",
    footer: "Si tengo 2 pérdidas seguidas → me detengo. No busco venganza.",
    items: [
      { id: "c-stop", label: "No muevo el stop para “darle aire”." },
      {
        id: "c-fear",
        label: "No cierro por miedo si el trade sigue en plan.",
      },
      { id: "c-add", label: "No añado posiciones fuera del plan." },
      {
        id: "c-manage",
        label: "Gestiono solo según mis reglas (BE, parciales, R objetivos).",
      },
    ],
  },
  {
    id: "after",
    title: "D. Después de operar",
    items: [
      {
        id: "d-risk",
        label: "¿Respeté riesgo por trade y pérdida máxima diaria?",
      },
      { id: "d-count", label: "¿Respeté mi número máximo de trades?" },
      { id: "d-aplus", label: "¿Tomé solo set-ups A+?" },
      { id: "d-journal", label: "Registré mis operaciones en el journal." },
      {
        id: "d-learn",
        label: "Escribí 1 cosa que hice bien y 1 cosa a mejorar.",
      },
    ],
  },
];

export const TRADING_QUOTES: Quote[] = [
  {
    id: "q1",
    text: "El mercado no te debe nada. Tu plan sí te debe disciplina.",
  },
  {
    id: "q2",
    text: "Una pérdida planificada es el costo de hacer negocio. Una pérdida emocional es un impuesto a la impulsividad.",
  },
  {
    id: "q3",
    text: "No operas para tener razón. Operas para ejecutar tu ventaja.",
  },
  {
    id: "q4",
    text: "Si no puedes aceptar la pérdida antes de entrar, no estás listo para el trade.",
  },
  {
    id: "q5",
    text: "La consistencia no nace de ganar más: nace de dejar de romper reglas.",
  },
  {
    id: "q6",
    text: "Dos pérdidas seguidas no son un mensaje del mercado. Son una señal para parar.",
  },
  {
    id: "q7",
    text: "Protege el capital. Protege la mente. El P&L es consecuencia.",
  },
  {
    id: "q8",
    text: "El set-up A+ es raro a propósito. Eso es una feature, no un bug.",
  },
];
