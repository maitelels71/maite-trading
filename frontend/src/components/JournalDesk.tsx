"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import { saveTradeToNotion, type JournalScreenshot } from "@/lib/api";
import {
  compressImageFile,
  imageFromDataTransfer,
} from "@/lib/image-compress";
import { localizedPlaybookLabel } from "@/lib/playbook-localize";
import { STRATEGY_PLAYBOOKS } from "@/lib/playbooks";

const ACTIVOS = ["NQ", "MNQ", "ES", "MES", "YM", "RTY", "GC", "CL", "Other"] as const;
const SESSIONS = ["Asia", "London", "NY AM", "NY PM", "Overnight"] as const;
const TFS = ["1H", "15m", "5m", "3m", "1m"] as const;
const STATUSES = ["Open", "Closed", "Scratched"] as const;
const STUCK = ["Yes", "No", "Partial"] as const;

const BEFORE_SLOTS = [
  { id: "before-1h", label: "Before · 1H" },
  { id: "before-15m", label: "Before · 15m" },
  { id: "before-entry", label: "Before · entry TF" },
] as const;

const AFTER_SLOTS = [
  { id: "after-entry", label: "After · entry TF" },
  { id: "after-15m", label: "After · 15m" },
] as const;

type ShotMap = Record<string, JournalScreenshot | null>;

function nowNyDateTimeLocal(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function ShotPasteSlot({
  label,
  shot,
  pasteHint,
  fileHint,
  clearLabel,
  onImage,
  onClear,
}: {
  label: string;
  shot: JournalScreenshot | null | undefined;
  pasteHint: string;
  fileHint: string;
  clearLabel: string;
  onImage: (file: File | Blob) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="button"
      onClick={() => ref.current?.focus()}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPaste={(e) => {
        const img = imageFromDataTransfer(e.clipboardData);
        if (!img) return;
        e.preventDefault();
        onImage(img);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const img = imageFromDataTransfer(e.dataTransfer);
        if (img) onImage(img);
      }}
      className={`rounded-lg border p-3 outline-none transition ${
        active || dragOver
          ? "border-[var(--accent)] bg-[var(--hover)]"
          : "border-[var(--border)]"
      }`}
    >
      <p className="text-sm font-medium">{label}</p>
      {shot ? (
        <div className="mt-2 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${shot.content_type};base64,${shot.data_base64}`}
            alt={label}
            className="max-h-28 w-full rounded-md object-contain bg-[var(--surface-muted)]"
          />
          <button
            type="button"
            className="text-xs text-[var(--muted)] underline"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            {clearLabel}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="rounded-md border border-dashed border-[var(--border-strong)] px-2 py-4 text-center text-xs text-[var(--muted)]">
            {pasteHint}
          </p>
          <label
            className="block cursor-pointer text-xs text-[var(--muted)] underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fileHint}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImage(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function JournalDesk() {
  const { t, locale } = useLocale();
  const playbookOptions = useMemo(
    () => [
      ...STRATEGY_PLAYBOOKS.map((p) => ({
        value: p.shortName,
        label: localizedPlaybookLabel(p, locale),
      })),
      { value: "Other", label: "Other" },
    ],
    [locale],
  );

  const [date, setDate] = useState(nowNyDateTimeLocal);
  const [activo, setActivo] = useState<string>("NQ");
  const [side, setSide] = useState<"Compra" | "Venta">("Compra");
  const [session, setSession] = useState<string>("NY AM");
  const [playbook, setPlaybook] = useState<string>("E01");
  const [tfSetup, setTfSetup] = useState<string>("15m");
  const [status, setStatus] = useState<string>("Closed");
  const [stuck, setStuck] = useState<string>("Yes");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [be, setBe] = useState("");
  const [rPlanned, setRPlanned] = useState("");
  const [rReal, setRReal] = useState("");
  const [pnl, setPnl] = useState("");
  const [thesis, setThesis] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [lesson, setLesson] = useState("");
  const [beforeShots, setBeforeShots] = useState<ShotMap>({});
  const [afterShots, setAfterShots] = useState<ShotMap>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [notionUrl, setNotionUrl] = useState<string | null>(null);

  useEffect(() => {
    setNotionUrl(null);
  }, [date]);

  async function setShotFromBlob(
    slotId: string,
    label: string,
    blob: File | Blob,
    which: "before" | "after",
  ) {
    try {
      const shot = await compressImageFile(blob, label, {
        filename: blob instanceof File ? blob.name : `${slotId}-paste.png`,
      });
      if (which === "before") {
        setBeforeShots((prev) => ({ ...prev, [slotId]: shot }));
      } else {
        setAfterShots((prev) => ({ ...prev, [slotId]: shot }));
      }
    } catch {
      setFlash("Image compress failed");
    }
  }

  function clearShot(slotId: string, which: "before" | "after") {
    if (which === "before") {
      setBeforeShots((prev) => ({ ...prev, [slotId]: null }));
    } else {
      setAfterShots((prev) => ({ ...prev, [slotId]: null }));
    }
  }

  function resetForm() {
    setSide("Compra");
    setEntry("");
    setSl("");
    setTp("");
    setBe("");
    setRPlanned("");
    setRReal("");
    setPnl("");
    setThesis("");
    setWhatHappened("");
    setLesson("");
    setBeforeShots({});
    setAfterShots({});
    setStuck("Yes");
    setStatus("Closed");
    setNotionUrl(null);
  }

  async function saveToNotion() {
    setBusy(true);
    setFlash(t("journal.saving"));
    try {
      const result = await saveTradeToNotion({
        date,
        title: activo,
        activo,
        side,
        session,
        playbook,
        tf_setup: tfSetup,
        status,
        stuck_to_plan: stuck,
        entry: parseNum(entry),
        sl: parseNum(sl),
        tp: parseNum(tp),
        be: parseNum(be),
        r_planned: parseNum(rPlanned),
        r_real: parseNum(rReal),
        pnl_usd: parseNum(pnl),
        thesis,
        what_happened: whatHappened,
        lesson,
        screenshots_before: Object.values(beforeShots).filter(
          (s): s is JournalScreenshot => Boolean(s),
        ),
        screenshots_after: Object.values(afterShots).filter(
          (s): s is JournalScreenshot => Boolean(s),
        ),
      });
      setNotionUrl(result.url || null);
      setFlash(
        `${t("journal.saved")} · imgs ${result.images_uploaded}` +
          (result.images_failed ? ` (${result.images_failed} failed)` : ""),
      );
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm";

  return (
    <DeskStack className="max-w-6xl space-y-1 px-6 py-8">
      <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            {t("journal.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">{t("journal.subtitle")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("journal.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveToNotion}
            disabled={busy}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {busy ? t("journal.saving") : t("journal.saveNotion")}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--muted)]"
          >
            {t("journal.reset")}
          </button>
        </div>
      </div>

      {flash ? (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          {flash}
          {notionUrl ? (
            <>
              {" · "}
              <a
                href={notionUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {t("journal.openNotion")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <DeskSession first step={1} title={t("session.tradeMeta")} panel={false}>
      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.activo")}</span>
          <select
            className={field}
            value={activo}
            onChange={(e) => setActivo(e.target.value)}
          >
            {ACTIVOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.date")}</span>
          <input
            type="datetime-local"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.side")}</span>
          <select
            className={field}
            value={side}
            onChange={(e) => setSide(e.target.value as "Compra" | "Venta")}
          >
            <option value="Compra">Compra</option>
            <option value="Venta">Venta</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.pnl")}</span>
          <input
            type="number"
            step="any"
            className={field}
            value={pnl}
            onChange={(e) => setPnl(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.session")}</span>
          <select
            className={field}
            value={session}
            onChange={(e) => setSession(e.target.value)}
          >
            {SESSIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.playbook")}</span>
          <select
            className={field}
            value={playbook}
            onChange={(e) => setPlaybook(e.target.value)}
          >
            {playbookOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.tf")}</span>
          <select
            className={field}
            value={tfSetup}
            onChange={(e) => setTfSetup(e.target.value)}
          >
            {TFS.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.status")}</span>
          <select
            className={field}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-[var(--muted)]">{t("journal.stuck")}</span>
          <select
            className={field}
            value={stuck}
            onChange={(e) => setStuck(e.target.value)}
          >
            {STUCK.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </section>
      </DeskSession>

      <DeskSession step={2} title={t("session.levels")} panel={false}>
      <section className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            [t("journal.entry"), entry, setEntry],
            [t("journal.sl"), sl, setSl],
            [t("journal.tp"), tp, setTp],
            [t("journal.be"), be, setBe],
            [t("journal.rPlanned"), rPlanned, setRPlanned],
            [t("journal.rReal"), rReal, setRReal],
          ] as const
        ).map(([label, value, setter]) => (
          <label key={label} className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">{label}</span>
            <input
              type="number"
              step="any"
              className={field}
              value={value}
              onChange={(e) => setter(e.target.value)}
            />
          </label>
        ))}
      </section>
      </DeskSession>

      <DeskSession step={3} title={t("session.notes")} panel={false}>
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("journal.thesis")}</span>
          <textarea
            className={`min-h-[72px] ${field}`}
            value={thesis}
            onChange={(e) => setThesis(e.target.value)}
            placeholder="1H bias + 15m zone + why this entry…"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("journal.what")}</span>
          <textarea
            className={`min-h-[72px] ${field}`}
            value={whatHappened}
            onChange={(e) => setWhatHappened(e.target.value)}
            placeholder="Fill, BE, TP/SL, management…"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("journal.lesson")}</span>
          <textarea
            className={`min-h-[72px] ${field}`}
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            placeholder="One lesson for tomorrow…"
          />
        </label>
      </section>
      </DeskSession>

      <DeskSession
        step={4}
        title={t("session.screenshotsBefore")}
        hint={t("journal.beforeHint")}
        panel={false}
      >
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {BEFORE_SLOTS.map((slot) => (
            <ShotPasteSlot
              key={slot.id}
              label={slot.label}
              shot={beforeShots[slot.id]}
              pasteHint={t("journal.pasteHint")}
              fileHint={t("journal.orFile")}
              clearLabel={t("journal.clearShot")}
              onImage={(blob) =>
                void setShotFromBlob(slot.id, slot.label, blob, "before")
              }
              onClear={() => clearShot(slot.id, "before")}
            />
          ))}
        </div>
      </section>
      </DeskSession>

      <DeskSession
        step={5}
        title={t("session.screenshotsAfter")}
        hint={t("journal.afterHint")}
        panel={false}
      >
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {AFTER_SLOTS.map((slot) => (
            <ShotPasteSlot
              key={slot.id}
              label={slot.label}
              shot={afterShots[slot.id]}
              pasteHint={t("journal.pasteHint")}
              fileHint={t("journal.orFile")}
              clearLabel={t("journal.clearShot")}
              onImage={(blob) =>
                void setShotFromBlob(slot.id, slot.label, blob, "after")
              }
              onClear={() => clearShot(slot.id, "after")}
            />
          ))}
        </div>
      </section>
      </DeskSession>
    </DeskStack>
  );
}
