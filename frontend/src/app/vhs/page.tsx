"use client";

import { useState } from "react";

type Lot = {
  id: string;
  name: string;
  price: number;
  floor: number;
  count: number;
  blurb: string;
  tapes: string[];
  title: string;
  description: string;
};

const LOTS: Lot[] = [
  {
    id: "A",
    name: "Rom-Com Nostalgia 2000s",
    price: 24,
    floor: 18,
    count: 4,
    blurb: "Chick flicks clásicos — Elle Woods, Kate Hudson, Amanda Bynes, Cameron Diaz.",
    tapes: [
      "Legally Blonde — Reese Witherspoon",
      "How to Lose a Guy in 10 Days — Kate Hudson / Matthew McConaughey",
      "What a Girl Wants — Amanda Bynes",
      "There's Something About Mary — Cameron Diaz / Ben Stiller",
    ],
    title:
      "LOTE 4 VHS Rom-Coms 2000s — Legally Blonde + How to Lose a Guy + What a Girl Wants + Something About Mary",
    description: `LOTE DE 4 PELÍCULAS VHS — COMEDIAS ROMÁNTICAS / CHICK FLICKS DE LOS 2000

Perfecto si te gusta la nostalgia, tienes VCR, o estás armando una colección de rom-coms clásicas.

INCLUYE:
• Legally Blonde — Reese Witherspoon
• How to Lose a Guy in 10 Days — Kate Hudson & Matthew McConaughey
• What a Girl Wants — Amanda Bynes
• There's Something About Mary — Cameron Diaz, Ben Stiller & Matt Dillon

DETALLES:
• Formato: VHS original en caja de cartón
• Condición: usadas / good — wear normal de estante en bordes (ver fotos)
• No son selladas de fábrica
• Ideales para noche de películas, decoración retro o colección

PRECIO DEL LOTE: $24 por las 4 (no se venden por separado)
Recojo local / entrega cerca (coordino).
Preguntas? Escríbeme en Marketplace.`,
  },
  {
    id: "B",
    name: "Kids Classics / Nostalgia Infantil",
    price: 28,
    floor: 22,
    count: 5,
    blurb: "Franklin, Arthur (Mister Rogers), 2 Barney + Teddy Bear Theater poco común.",
    tapes: [
      "Franklin Goes to Camp — Nelvana",
      "Arthur's Famous Friends — Mister Rogers / Yo-Yo Ma",
      "Barney's Campfire Sing-Along — Classic Collection",
      "Barney's Home Sweet Homes",
      "Yo! Columbus — Whirligig's Teddy Bear Theater (Kermit Love)",
    ],
    title:
      "LOTE 5 VHS Infantiles Clásicos — Franklin + Arthur (Mister Rogers) + 2 Barney + Teddy Bear Theater",
    description: `LOTE DE 5 VHS INFANTILES — NOSTALGIA DE LOS 90s / PBS KIDS

Ideal para padres nostálgicos, maestros, o quien quiera revivir Franklin, Arthur y Barney en VHS.

INCLUYE:
• Franklin Goes to Camp — Nelvana Classics
• Arthur's Famous Friends — con cameos de Mister Rogers, Itzhak Perlman, Yo-Yo Ma
• Barney's Campfire Sing-Along — Classic Collection
• Barney's Home Sweet Homes — Barney & Friends
• Yo! Columbus — Whirligig's Teddy Bear Theater con Kermit Love (diseñador de Big Bird / Muppets) — título poco común

DETALLES:
• Formato: VHS en caja de cartón
• Condición: usadas — wear en bordes; Home Sweet Homes tiene nombre escrito en portada (ver fotos)
• No selladas
• Excelente lote temático de niños / sing-along

PRECIO DEL LOTE: $28 por las 5 (no separo)
Recojo local disponible.`,
  },
  {
    id: "C",
    name: "Fitness / Workout Vintage",
    price: 12,
    floor: 9,
    count: 3,
    blurb: "Tae Bo Billy Blanks + Yoga Patricia Walden + Pilates Kathy Smith.",
    tapes: [
      "Tae Bo Basic — Billy Blanks ORIGINAL",
      "Yoga Journal's Yoga for Beginners — Patricia Walden",
      "Pilates for Abs — Kathy Smith",
    ],
    title:
      "LOTE 3 VHS Fitness Vintage — Tae Bo Billy Blanks + Yoga Patricia Walden + Pilates Kathy Smith",
    description: `LOTE DE 3 VHS DE EJERCICIO / FITNESS — CLÁSICOS “AS SEEN ON TV”

INCLUYE:
• Tae Bo Basic — Billy Blanks ORIGINAL
• Yoga Journal's Yoga for Beginners — Patricia Walden
• Pilates for Abs — Kathy Smith

DETALLES: VHS usadas / good — desgaste leve (ver fotos). Se venden juntas.

PRECIO DEL LOTE: $12 por las 3
Recojo local.`,
  },
  {
    id: "D",
    name: "Drama / Thriller Stars",
    price: 12,
    floor: 8,
    count: 3,
    blurb: "Robin Williams + Sandra Bullock (+ young Ryan Gosling) + Michelle Pfeiffer.",
    tapes: [
      "Bicentennial Man — Robin Williams",
      "Murder by Numbers — Sandra Bullock / Ryan Gosling",
      "The Deep End of the Ocean — Michelle Pfeiffer",
    ],
    title:
      "LOTE 3 VHS Drama/Thriller — Robin Williams + Sandra Bullock + Michelle Pfeiffer",
    description: `LOTE DE 3 PELÍCULAS VHS — DRAMA Y SUSPENSO CON ESTRELLAS

INCLUYE:
• Bicentennial Man — Robin Williams (Chris Columbus)
• Murder by Numbers — Sandra Bullock, con Ryan Gosling temprano
• The Deep End of the Ocean — Michelle Pfeiffer (basada en bestseller)

DETALLES: VHS retail usadas — shelf wear típico (ver fotos). Precio de lote.

PRECIO DEL LOTE: $12 por las 3
Recojo local / puedo coordinar entrega cercana.`,
  },
];

const MEGA = {
  price: 65,
  floor: 55,
  title:
    "LOTE 15 VHS — Rom-coms 2000s + Kids (Barney/Arthur/Franklin) + Fitness + Dramas — Todo junto $65",
  description: `MEGA-LOTE: las 15 cintas VHS (4 colecciones temáticas).

Incluye rom-coms 2000s, infantiles (Franklin / Arthur / Barney / Teddy Bear Theater), fitness vintage y dramas/thrillers.

Condición: usadas (ver fotos en Marketplace).
Precio: $65 el paquete completo.
Recojo local. Escríbeme en Marketplace para coordinar.`,
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* ignore */
        }
      }}
      className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--hover)]"
    >
      {done ? "Copiado" : label}
    </button>
  );
}

export default function VhsMarketplacePage() {
  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : "https://d2v5qh8mus9ucq.cloudfront.net/vhs/";

  return (
    <div className="min-h-screen text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
              Garage sale catalog
            </p>
            <h1 className="text-xl font-semibold tracking-tight">VHS lots for sale</h1>
          </div>
          <p className="text-sm text-[var(--muted)]">15 tapes · 4 themed lots · local pickup</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-base font-semibold">How to buy</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
            <li>Pick a lot below (or the full 15-tape bundle).</li>
            <li>Message me on the Facebook Marketplace listing with the lot letter (A–D).</li>
            <li>We coordinate local pickup. Prices below are firm asking; small room to negotiate.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton text={pageUrl} label="Copy this page link" />
            <CopyButton
              text={`${MEGA.title}\n\n${MEGA.description}\n\nDetails: ${pageUrl}`}
              label="Copy mega-lot post"
            />
          </div>
        </section>

        <section className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--accent-fg)]">
              All 15 tapes (mega-lot)
            </h2>
            <p className="text-2xl font-semibold text-[var(--accent-fg)]">${MEGA.price}</p>
          </div>
          <p className="mt-1 text-sm text-[var(--accent-fg)]/80">
            Floor if negotiating: ${MEGA.floor}. Faster for both of us.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Themed lots
          </h2>
          {LOTS.map((lot) => (
            <article
              key={lot.id}
              id={`lot-${lot.id.toLowerCase()}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                    Lot {lot.id} · {lot.count} VHS
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{lot.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{lot.blurb}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">${lot.price}</p>
                  <p className="text-xs text-[var(--muted)]">ask · floor ${lot.floor}</p>
                </div>
              </div>

              <ul className="mt-4 space-y-1.5 text-sm">
                {lot.tapes.map((t) => (
                  <li key={t} className="text-[var(--foreground)]">
                    · {t}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <CopyButton
                  text={`${lot.title}\n\n${lot.description}\n\nFull catalog: ${pageUrl}#lot-${lot.id.toLowerCase()}`}
                  label="Copy Marketplace post"
                />
                <CopyButton text={`$${lot.price}`} label="Copy price" />
              </div>
            </article>
          ))}
        </section>

        <footer className="border-t border-[var(--border)] pt-6 pb-10 text-center text-sm text-[var(--muted)]">
          <p>Used VHS · not sealed · shelf wear on some boxes · sold as lots.</p>
          <p className="mt-1">
            Shareable catalog:{" "}
            <a
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              href="https://d2v5qh8mus9ucq.cloudfront.net/vhs/"
            >
              d2v5qh8mus9ucq.cloudfront.net/vhs/
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
