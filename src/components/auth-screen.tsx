"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { ArrowRight, LockKeyhole, Sprout } from "lucide-react";
import { readStoredLocale, UI_COPY, writeStoredLocale } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

const authClient = createAuthClient();

export function AuthScreen({
  allowSignUp,
  googleEnabled = false,
  initialMode = "sign-in",
}: {
  allowSignUp: boolean;
  googleEnabled?: boolean;
  initialMode?: "sign-in" | "sign-up";
}) {
  const [locale, setLocale] = useState<AppLocale>(() => readStoredLocale());
  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    initialMode === "sign-up" && allowSignUp ? "sign-up" : "sign-in",
  );
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

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result?.error) {
        throw new Error(
          result.error.message ||
            (locale === "id" ? "Gagal masuk dengan Google." : "Couldn’t sign in with Google."),
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : locale === "id"
            ? "Terjadi kesalahan. Silakan coba lagi."
            : "Something went wrong. Please try again.",
      );
      setBusy(false);
    }
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
      if (result.error)
        throw new Error(
          result.error.message ||
            (locale === "id"
              ? "Gagal masuk. Periksa kembali datamu."
              : "Couldn’t sign in. Please check your details."),
        );
      window.location.replace("/");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : locale === "id"
            ? "Terjadi kesalahan. Silakan coba lagi."
            : "Something went wrong. Please try again.",
      );
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

          {googleEnabled && (
            <>
              <button
                type="button"
                className="button-secondary auth-google-btn"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                </svg>
                <span>{copy.continueWithGoogle}</span>
              </button>
              <div className="auth-divider">
                <span>{copy.orWithEmail}</span>
              </div>
            </>
          )}

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
