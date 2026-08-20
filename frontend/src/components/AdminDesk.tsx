"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  fetchAdminOverview,
  getApiBase,
  publishSchwabToken,
  refreshSchwabToken,
  upsertSchwabToken,
} from "@/lib/api";
import type { AdminOverview, SchwabTokenStatus } from "@/lib/types";

function formatCountdown(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds <= 0) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusTone(status: SchwabTokenStatus | null): string {
  if (!status?.has_access_token) return "text-[var(--danger)]";
  if (status.expired) return "text-[var(--danger)]";
  if ((status.expires_in_seconds ?? 0) < 300) return "text-[var(--warn)]";
  return "text-[var(--ok)]";
}

export function AdminDesk() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [tokenJson, setTokenJson] = useState("");
  const [publishOnSave, setPublishOnSave] = useState(true);

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const data = await fetchAdminOverview();
        setOverview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load admin");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const schwab = overview?.schwab ?? null;
  const remaining =
    schwab?.expires_at != null
      ? Math.floor(schwab.expires_at - Date.now() / 1000)
      : schwab?.expires_in_seconds ?? null;
  void tick;

  const login = overview?.schwab_login ?? null;
  const redirectUri = login?.redirect_uri ?? "";
  const localCallback8182 = /127\.0\.0\.1:8182|localhost:8182/i.test(redirectUri);
  const refreshLikelyDead =
    Boolean(schwab?.expired) && (remaining ?? 0) < -24 * 3600;

  function onLoginWithSchwab() {
    setError(null);
    setMessage(null);
    if (localCallback8182) {
      setError(
        "This machine’s Schwab callback is https://127.0.0.1:8182 — the Admin tab cannot receive the login. From backend run: python -m scripts.schwab_login  Then Approve in the browser that opens.",
      );
      return;
    }
    if (!login?.authorize_url) {
      setError("Schwab login link not available — check CLIENT_ID on the API.");
      return;
    }
    window.open(login.authorize_url, "_blank", "noopener,noreferrer");
    setMessage(
      "Schwab login opened in a new tab. After Approve, return here and Reload status.",
    );
  }

  function onRefresh() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const status = await refreshSchwabToken();
        setOverview((prev) => (prev ? { ...prev, schwab: status } : prev));
        setMessage("Schwab access token refreshed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Refresh failed");
      }
    });
  }

  function onPublish() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const status = await publishSchwabToken();
        setOverview((prev) =>
          prev
            ? {
                ...prev,
                schwab: status,
                api_secrets_arn_set: true,
              }
            : prev,
        );
        setMessage(
          "Token published to Secrets Manager. Staging Sync can use it — no CloudFront rebuild needed for this step.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Publish failed");
      }
    });
  }

  function onSaveToken() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const status = await upsertSchwabToken({
          token_json: tokenJson,
          publish: publishOnSave,
        });
        setOverview((prev) =>
          prev
            ? {
                ...prev,
                schwab: status,
                api_secrets_arn_set:
                  status.published || prev.api_secrets_arn_set,
              }
            : prev,
        );
        setTokenJson("");
        setMessage(
          status.published
            ? "Token saved and published to Secrets Manager."
            : "Token saved on the API host (file/env).",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save token failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Admin</h2>
          <p className="text-sm text-[var(--muted)]">
            Broker tokens, publish to staging, and deploy notes.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={load}
          className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm hover:bg-[var(--hover)] disabled:opacity-60"
        >
          {pending ? "Working…" : "Reload status"}
        </button>
      </div>

      {overview ? (
        <p className="text-xs text-[var(--muted)]">
          env <code>{overview.environment}</code>
          {" · "}
          storage <code>{overview.storage_backend}</code>
          {" · "}
          API <code>{getApiBase()}</code>
        </p>
      ) : !pending && !error ? (
        <p className="text-xs text-[var(--muted)]">Loading Schwab status…</p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-[var(--ok)]/30 bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          {message}
        </p>
      ) : null}

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <div>
          <h3 className="text-lg font-semibold">Charles Schwab</h3>
          <p className="text-sm text-[var(--muted)]">
            Access tokens last ~30 minutes. Refresh uses your refresh_token; Publish
            copies the token into AWS Secrets Manager for CloudFront staging.
          </p>
        </div>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--foreground)]">Where the token is stored</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Local file: <code>.secrets/schwab_token.json</code>
              {schwab?.token_path ? (
                <>
                  {" "}
                  (API path: <code className="break-all">{schwab.token_path}</code>)
                </>
              ) : null}
            </li>
            <li>
              Staging: AWS Secrets Manager{" "}
              <code>maite-trading/staging/app</code> → field{" "}
              <code>SCHWAB_TOKEN_JSON</code>
            </li>
          </ul>
        </div>

        {schwab?.expired || refreshLikelyDead ? (
          <p className="rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
            Schwab access token expired
            {schwab?.expires_at_iso ? ` (${schwab.expires_at_iso} UTC)` : ""}.
            Refresh will not work after ~7 days. Re-login from{" "}
            <code>backend</code>:{" "}
            <code>python -m scripts.schwab_login</code>
            {localCallback8182
              ? " — that script listens on https://127.0.0.1:8182 (Admin Login cannot)."
              : "."}
          </p>
        ) : null}
        {localCallback8182 && !schwab?.expired ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--muted)]">
            Local OAuth callback is <code>https://127.0.0.1:8182</code>. To get a
            new token: <code>cd backend</code> then{" "}
            <code>python -m scripts.schwab_login</code>.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</p>
            <p className={`text-lg font-semibold ${statusTone(schwab)}`}>
              {!schwab
                ? "—"
                : !schwab.has_access_token
                  ? "No token"
                  : schwab.expired
                    ? "Expired"
                    : "Connected"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              source: {schwab?.source ?? (pending ? "loading…" : "—")}
              {schwab
                ? schwab.configured
                  ? " · client OK"
                  : " · client missing"
                : ""}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Access token expires
            </p>
            <p className={`font-mono text-lg font-semibold ${statusTone(schwab)}`}>
              {formatCountdown(remaining)}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {schwab?.expires_at_iso
                ? `UTC ${schwab.expires_at_iso}`
                : "No expiry on file"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Publish</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">
              {overview?.api_secrets_arn_set || schwab?.publish_available
                ? "Ready"
                : "Local only"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {schwab?.has_refresh_token
                ? refreshLikelyDead
                  ? "refresh_token on file — likely stale; Login again"
                  : "refresh_token present"
                : "no refresh_token"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onLoginWithSchwab}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {localCallback8182 ? "How to re-login" : "Login with Schwab"}
          </button>
          <button
            type="button"
            disabled={pending || !schwab?.has_refresh_token || refreshLikelyDead}
            onClick={onRefresh}
            title={
              refreshLikelyDead
                ? "Access token died days ago — Schwab refresh usually fails. Re-login."
                : undefined
            }
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--hover)] disabled:opacity-60"
          >
            Refresh token
          </button>
          <button
            type="button"
            disabled={
              pending ||
              !schwab?.has_access_token ||
              !(overview?.api_secrets_arn_set || schwab?.publish_available)
            }
            onClick={onPublish}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--hover)] disabled:opacity-60"
          >
            Publish to staging
          </button>
        </div>

        {login ? (
          <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
            <p className="font-medium text-[var(--foreground)]">Schwab OAuth callback</p>
            <p>
              Portal Callback URL must match exactly:
            </p>
            <p className="break-all font-mono text-xs text-[var(--foreground)]">
              {login.redirect_uri}
            </p>
            {login.authorize_url ? (
              <p>
                Direct link:{" "}
                <a
                  className="text-[var(--accent)] underline break-all"
                  href={login.authorize_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Schwab authorize
                </a>
              </p>
            ) : null}
            <p>{login.portal_hint}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <div>
          <h3 className="text-lg font-semibold">Paste / update token</h3>
          <p className="text-sm text-[var(--muted)]">
            Paste the full JSON from{" "}
            <code>c:\Code\maite-trading\.secrets\schwab_token.json</code> (needs{" "}
            <code>access_token</code> + <code>refresh_token</code>).
          </p>
        </div>
        <textarea
          className="min-h-36 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-xs"
          placeholder='{"access_token":"...","refresh_token":"...","expires_in":1800}'
          value={tokenJson}
          onChange={(e) => setTokenJson(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={publishOnSave}
            onChange={(e) => setPublishOnSave(e.target.checked)}
          />
          Also publish to Secrets Manager (staging)
        </label>
        <button
          type="button"
          disabled={pending || tokenJson.trim().length < 10}
          onClick={onSaveToken}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          Save token
        </button>
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <h3 className="text-lg font-semibold">What each action does</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
          <li>
            <span className="font-medium text-[var(--foreground)]">
              {localCallback8182 ? "How to re-login" : "Login with Schwab"}
            </span>{" "}
            —
            {localCallback8182 ? (
              <>
                on this PC the callback is port 8182, so run{" "}
                <code>python -m scripts.schwab_login</code> from{" "}
                <code>backend</code> instead of expecting the Admin tab to catch
                the redirect. After Approve, Reload status.
              </>
            ) : (
              <>
                opens Charles Schwab OAuth when you need a new auth (first time or
                refresh failed). After Approve, the API callback stores the token.
              </>
            )}
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Save token</span> —
            writes the pasted JSON to the API token store and optionally Secrets Manager.
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Refresh token</span> —
            calls Schwab OAuth refresh (~30 min access token).
          </li>
          <li>
            <span className="font-medium text-[var(--foreground)]">Publish to staging</span> —
            copies the current token into{" "}
            <code>maite-trading/staging/app</code> → <code>SCHWAB_TOKEN_JSON</code>.
          </li>
        </ol>
      </section>

      {overview?.notes?.length ? (
        <section className="space-y-2 border-t border-[var(--border)] pt-6">
          <h3 className="text-lg font-semibold">Notes</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {overview.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
