"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { ArrowRight, LockKeyhole, Sprout } from "lucide-react";
import { readStoredLocale, UI_COPY, writeStoredLocale } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

const authClient = createAuthClient();

export function AuthScreen({ allowSignUp }: { allowSignUp: boolean }) {
  const [locale, setLocale] = useState<AppLocale>(() => readStoredLocale());
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = UI_COPY[locale];

  function switchLocale(next: AppLocale) {
    setLocale(next);
    writeStoredLocale(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email: email.trim(), password })
          : await authClient.signUp.email({ email: email.trim(), password, name: name.trim() });
      if (result.error) throw new Error(result.error.message || (locale === "id" ? "Gagal masuk. Periksa kembali datamu." : "Couldn’t sign in. Please check your details."));
      // Re-read the session on a full navigation across the authentication boundary.
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : locale === "id" ? "Terjadi kesalahan. Silakan coba lagi." : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <div className="auth-brand">
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          <span className="brand-word">
            <strong>
              bloom<span>.</span>
            </strong>
            <small>{copy.brandSub}</small>
          </span>
        </div>
        <div className="segment-control auth-lang-switch" role="group" aria-label={copy.languageToggleAria}>
          <button type="button" className={locale === "en" ? "selected" : ""} aria-pressed={locale === "en"} onClick={() => switchLocale("en")}>
            EN
          </button>
          <button type="button" className={locale === "id" ? "selected" : ""} aria-pressed={locale === "id"} onClick={() => switchLocale("id")}>
            ID
          </button>
        </div>
      </div>

      <div className="auth-layout">
        <section className="auth-hero">
          <h1>{copy.authHeroTitle}</h1>
          <p>{copy.authHeroBody}</p>
        </section>
        <section className="card auth-card">
          <span className="widget-icon green">
            <LockKeyhole size={20} />
          </span>
          <h2>{mode === "sign-in" ? copy.signIn : copy.createAccount}</h2>
          <p>{mode === "sign-in" ? copy.signInDesc : copy.signUpDesc}</p>
          <form onSubmit={submit}>
            {mode === "sign-up" && (
              <label>
                {copy.yourName}
                <input maxLength={40} required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              {copy.emailAddress}
              <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              {copy.password}
              <input
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small>{copy.passwordHint}</small>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? copy.pleaseWait : mode === "sign-in" ? copy.signIn : copy.createAccount}
              <ArrowRight size={16} />
            </button>
          </form>
          {allowSignUp && (
            <div className="auth-switch">
              {mode === "sign-in" ? copy.newHere : copy.alreadyHaveAccount}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                  setError("");
                }}
              >
                {mode === "sign-in" ? copy.createAnAccount : copy.signIn}
              </button>
            </div>
          )}
          <a className="auth-local" href="/local/">
            {copy.useBrowserInstead} <ArrowRight size={14} />
          </a>
        </section>
      </div>
    </main>
  );
}
