"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { ArrowRight, LockKeyhole, Sprout } from "lucide-react";
const authClient = createAuthClient();
export function AuthScreen({ allowSignUp }: { allowSignUp: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in"); const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = mode === "sign-in" ? await authClient.signIn.email({ email: email.trim(), password }) : await authClient.signUp.email({ email: email.trim(), password, name: name.trim() });
      if (result.error) throw new Error(result.error.message || "Couldn’t sign in. Please check your details.");
      // Re-read the session on a full navigation across the authentication boundary.
      window.location.replace("/");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again."); setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-brand"><span className="brand-mark"><Sprout size={25}/></span><span className="brand-word"><strong>bloom<span>.</span></strong><small>TRADING JOURNAL</small></span></div><div className="auth-layout"><section className="auth-hero"><h1>Your trading journal.</h1><p>Review trades, track your process, and reflect on your decisions.</p></section><section className="card auth-card"><span className="widget-icon green"><LockKeyhole size={20}/></span><h2>{mode === "sign-in" ? "Sign in" : "Create account"}</h2><p>{mode === "sign-in" ? "Sign in to your private journal." : "Create an account to sync your journal across devices."}</p><form onSubmit={submit}>{mode === "sign-up" && <label>Your name<input maxLength={40} required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)}/></label>}<label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Password<input type="password" minLength={12} maxLength={128} required autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)}/><small>At least 12 characters. Password recovery is not configured.</small></label>{error && <div className="form-error" role="alert">{error}</div>}<button type="submit" className="button-primary" disabled={busy}>{busy ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}<ArrowRight size={16}/></button></form>{allowSignUp && <div className="auth-switch">{mode === "sign-in" ? "New here?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }}>{mode === "sign-in" ? "Create an account" : "Sign in"}</button></div>}<a className="auth-local" href="/local/">Use this browser instead <ArrowRight size={14}/></a></section></div></main>;
}
