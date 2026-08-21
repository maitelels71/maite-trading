"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import {
  BitcoinMark,
  CandlesMark,
  FuturesMark,
} from "@/components/HubDeskIcons";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocale } from "@/components/LocaleProvider";
import { deskLogin } from "@/lib/api";
import { coinbaseDeskHref, futuresDeskHref, optionsDeskHref, toStaticHtmlPath } from "@/lib/app-mode";
import { DESK_VERSION } from "@/lib/desk-version";
import {
  absorbDeskTokenFromLocation,
  clearDeskToken,
  getDeskToken,
  setDeskToken,
  withDeskSessionHash,
} from "@/lib/desk-session";

function safeNextPath(raw: string | null): string {
  if (!raw) return "";
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  try {
    const u = new URL(path, "https://desk.local");
    u.searchParams.delete("ds");
    return toStaticHtmlPath(`${u.pathname}${u.search}`) || path;
  } catch {
    return toStaticHtmlPath(path);
  }
}

export function HubLanding() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState("maite");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const existing = absorbDeskTokenFromLocation();
    setToken(existing);
    const next = safeNextPath(searchParams.get("next"));
    if (existing && next) {
      window.location.replace(withDeskSessionHash(next, existing));
    }
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await deskLogin(username, password);
      setDeskToken(res.token);
      setToken(res.token);
      const next = safeNextPath(searchParams.get("next"));
      if (next) {
        window.location.assign(withDeskSessionHash(next, res.token));
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("hub.loginFailed"));
    } finally {
      setPending(false);
    }
  }

  function logout() {
    clearDeskToken();
    setToken("");
    setPassword("");
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-[var(--foreground)]">
      <div
        className="hub-wash pointer-events-none absolute inset-0 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(900px 420px at 12% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), radial-gradient(700px 380px at 100% 0%, color-mix(in srgb, #c9893a 18%, transparent), transparent 55%)",
        }}
      />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-fg)]">
              {t("hub.kicker")}
            </p>
            <p className="truncate text-lg font-bold leading-tight sm:text-xl">
              Trading Like a Boss
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="tabular-nums text-[10px] font-semibold text-[var(--muted)]"
            title={DESK_VERSION}
          >
            {DESK_VERSION}
          </span>
          <LanguageToggle />
          <ThemeToggle />
          {token ? (
            <button
              type="button"
              onClick={logout}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--hover)]"
            >
              {t("hub.logout")}
            </button>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
        {token === undefined ? (
          <div className="h-40" />
        ) : token === "" ? (
          <section className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-lg backdrop-blur sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight">
              {t("hub.loginTitle")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {t("hub.loginHint")}
            </p>
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block text-sm font-semibold">
                {t("hub.user")}
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-base font-normal outline-none ring-[var(--accent)] focus:ring-2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                {t("hub.password")}
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-base font-normal outline-none ring-[var(--accent)] focus:ring-2"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error ? (
                <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--on-accent)] shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {pending ? t("hub.submitting") : t("hub.submit")}
              </button>
            </form>
          </section>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-fg)]">
                {t("hub.hello")}
              </p>
              <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                {t("hub.title")}
              </h1>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <DeskCard
                href={withDeskSessionHash(optionsDeskHref(), token)}
                eyebrow={t("hub.optionsEyebrow")}
                title={t("hub.optionsTitle")}
                body={t("hub.optionsBody")}
                cta={t("hub.optionsCta")}
                tint="teal"
                icon={<CandlesMark className="h-10 w-10" />}
              />
              <DeskCard
                href={withDeskSessionHash(futuresDeskHref(), token)}
                eyebrow={t("hub.futuresEyebrow")}
                title={t("hub.futuresTitle")}
                body={t("hub.futuresBody")}
                cta={t("hub.futuresCta")}
                tint="bronze"
                icon={<FuturesMark className="h-10 w-10" />}
              />
              <DeskCard
                href={withDeskSessionHash(coinbaseDeskHref(), token)}
                eyebrow={t("hub.coinbaseEyebrow")}
                title={t("hub.coinbaseTitle")}
                body={t("hub.coinbaseBody")}
                cta={t("hub.coinbaseCta")}
                tint="blue"
                icon={<BitcoinMark className="h-10 w-10" />}
              />
            </div>
            <figure className="hub-quote mt-8 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 shadow-sm backdrop-blur">
              <div className="flex">
                <div
                  className="w-1.5 shrink-0 bg-[var(--accent)]"
                  aria-hidden
                />
                <blockquote className="grid flex-1 items-stretch gap-4 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_8.5rem] lg:grid-cols-[1fr_1fr_1fr_10rem] sm:gap-5 sm:px-6 sm:py-4">
                  <p className="text-sm leading-relaxed text-[var(--foreground)] sm:text-[15px]">
                    {t("hub.note1")}
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--foreground)]/90 sm:text-[15px]">
                    {t("hub.note2")}
                  </p>
                  <div>
                    <p className="text-sm leading-relaxed text-[var(--foreground)]/90 sm:text-[15px]">
                      {t("hub.note3")}
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-wide text-[var(--accent-fg)]">
                      {t("hub.noteClose")}
                    </p>
                  </div>
                  <div className="hub-quote-art relative h-28 overflow-hidden rounded-xl sm:h-auto sm:min-h-[7.5rem]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/hub-still-walking.png"
                      alt={t("hub.noteImageAlt")}
                      className="h-full w-full object-cover object-center"
                    />
                  </div>
                </blockquote>
              </div>
            </figure>
          </>
        )}
      </main>
    </div>
  );
}

function DeskCard({
  href,
  eyebrow,
  title,
  body,
  cta,
  tint,
  icon,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  tint: "teal" | "bronze" | "blue";
  icon: ReactNode;
}) {
  const ring =
    tint === "teal"
      ? "hover:ring-[var(--accent)]"
      : tint === "bronze"
        ? "hover:ring-[#c9893a]"
        : "hover:ring-[#3b82f6]";
  const badge =
    tint === "teal"
      ? "bg-[var(--accent-soft)] text-[var(--accent-fg)]"
      : tint === "bronze"
        ? "bg-[#f5e6d0] text-[#8a5420]"
        : "bg-[var(--info-soft)] text-[var(--info)]";
  return (
    <a
      href={href}
      onClick={(e) => {
        // Full navigation; re-assert session cookie right before leaving hub.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        const t = getDeskToken();
        if (t) setDeskToken(t);
        window.location.assign(href);
      }}
      className={`group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:ring-2 ${ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${badge}`}
        >
          {eyebrow}
        </span>
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
      </div>
      <h2 className="mt-4 text-xl font-bold">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">
        {body}
      </p>
      <span className="mt-5 text-sm font-bold text-[var(--accent-fg)] group-hover:underline">
        {cta} →
      </span>
    </a>
  );
}
