"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import { DeskSession, DeskStack } from "@/components/DeskSession";
import { useLocale } from "@/components/LocaleProvider";
import {
  fetchJobsRuns,
  fetchJobsStatus,
  runCandleArchiveBackfill,
  runCandleArchiveEod,
} from "@/lib/api";
import type { JobRun, JobsStatusResponse } from "@/lib/types";

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function statusClass(status: string | null | undefined): string {
  if (status === "ok") return "text-[var(--ok)]";
  if (status === "partial") return "text-amber-700 dark:text-amber-300";
  if (status === "error") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

export function JobsDesk() {
  const { t } = useLocale();
  const [status, setStatus] = useState<JobsStatusResponse | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const errors: string[] = [];
      try {
        const st = await fetchJobsStatus();
        setStatus(st);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "status failed");
      }
      try {
        const hist = await fetchJobsRuns(40);
        setRuns(hist);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "runs failed");
      }
      if (errors.length) setError(errors.join(" · "));
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function onEod() {
    startTransition(async () => {
      setError(null);
      setNote(t("jobs.runningEod"));
      try {
        const res = await runCandleArchiveEod();
        if ("accepted" in res && res.accepted) {
          setNote(String(res.message || t("jobs.acceptedBg")));
        } else {
          const run = res as JobRun;
          setNote(
            `${t("jobs.done")} · ${run.status} · ${run.summary?.bars ?? 0} bars`,
          );
        }
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "EOD failed");
        setNote(null);
      }
    });
  }

  function onBackfill() {
    startTransition(async () => {
      setError(null);
      setNote(t("jobs.runningBackfill"));
      try {
        const res = await runCandleArchiveBackfill({ lookback_days: 59 });
        if ("accepted" in res && res.accepted) {
          setNote(String(res.message || t("jobs.acceptedBg")));
        } else {
          const run = res as JobRun;
          setNote(
            `${t("jobs.done")} · ${run.status} · ${run.summary?.bars ?? 0} bars`,
          );
        }
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Backfill failed");
        setNote(null);
      }
    });
  }

  return (
    <DeskStack>
      <DeskSession
        first
        title={t("jobs.title")}
        hint={t("jobs.hint")}
        panel={false}
      >
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted)]">{t("jobs.blurb")}</p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
            <p className="font-semibold text-[var(--fg)]">{t("jobs.scheduleTitle")}</p>
            <p className="mt-1.5">{t("jobs.scheduleEod")}</p>
            <p className="mt-1">{t("jobs.scheduleBackfill")}</p>
            {status?.backend ? (
              <p className="mt-1.5 font-mono text-[10px]">
                {t("jobs.backend")}: {status.backend}
                {status.now_et ? ` · now ET ${fmtWhen(status.now_et)}` : null}
              </p>
            ) : null}
          </div>
          {status?.note ? (
            <p className="text-[11px] text-[var(--muted)]">{status.note}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onEod}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
              {t("jobs.runEod")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onBackfill}
              className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold hover:bg-[var(--hover)] disabled:opacity-60"
            >
              {t("jobs.runBackfill")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={reload}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-60"
            >
              {t("jobs.refresh")}
            </button>
          </div>
          {note ? (
            <p className="text-[11px] text-[var(--ok)]">{note}</p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>
      </DeskSession>

      <DeskSession title={t("jobs.scheduled")} hint={t("jobs.scheduledHint")} panel={false}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(status?.jobs ?? []).map((job) => (
            <div
              key={job.job_name}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <p className="text-sm font-semibold">{job.label}</p>
              <p className="mt-0.5 text-[10px] font-mono text-[var(--muted)]">
                {job.job_name}
              </p>
              <div className="mt-2 space-y-0.5 text-[11px] text-[var(--muted)]">
                <p>
                  <span className="font-medium text-[var(--fg)]">
                    {t("jobs.scheduleLabel")}:{" "}
                  </span>
                  {job.schedule}
                </p>
                {job.schedule_et ? (
                  <p>
                    {t("jobs.scheduleEt")}: {job.schedule_et}
                  </p>
                ) : null}
                {job.schedule_utc ? (
                  <p>
                    {t("jobs.scheduleUtc")}: {job.schedule_utc}
                  </p>
                ) : null}
                {job.schedule_note ? (
                  <p className="pt-0.5">{job.schedule_note}</p>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                TFs: {job.timeframes.join(" · ")}
              </p>
              {job.latest ? (
                <div className="mt-3 space-y-0.5 text-[11px]">
                  <p>
                    <span className="text-[var(--muted)]">{t("jobs.lastRun")}: </span>
                    <span className={statusClass(job.latest.status)}>
                      {job.latest.status}
                    </span>
                    <span className="text-[var(--muted)]">
                      {" "}
                      · {fmtWhen(job.latest.finished_at || job.latest.started_at)} ET
                    </span>
                  </p>
                  <p className="text-[var(--muted)]">
                    {job.latest.summary.bars} bars · ok {job.latest.summary.units_ok} ·
                    err {job.latest.summary.units_err} · {job.latest.trigger}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  {t("jobs.neverRun")}
                </p>
              )}
            </div>
          ))}
          {!status && !error ? (
            <p className="text-sm text-[var(--muted)]">{t("jobs.loading")}</p>
          ) : null}
        </div>
      </DeskSession>

      <DeskSession title={t("jobs.history")} hint={t("jobs.historyHint")} panel={false}>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">{t("jobs.colJob")}</th>
                <th className="px-3 py-2">{t("jobs.colWhen")}</th>
                <th className="px-3 py-2">{t("jobs.colStatus")}</th>
                <th className="px-3 py-2">{t("jobs.colBars")}</th>
                <th className="px-3 py-2">{t("jobs.colTrigger")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-[var(--muted)]"
                  >
                    {t("jobs.historyEmpty")}
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr
                    key={`${r.job_name}-${r.started_at}`}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-[11px]">{r.job_name}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmtWhen(r.finished_at || r.started_at)}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${statusClass(r.status)}`}>
                      {r.status}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.summary.bars}
                      <span className="text-[var(--muted)]">
                        {" "}
                        ({r.summary.units_ok}/{r.summary.units_err})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">{r.trigger}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DeskSession>
    </DeskStack>
  );
}
