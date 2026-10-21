"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Mode = "login" | "signup" | "forgot" | "reset";

const reasonMessages: Record<string, string> = {
  configuration: "Secure sign-in is not configured for this deployment.",
  profile: "Your staff profile is not ready. Contact an administrator.",
  access: "We could not verify your access. Please sign in again.",
  notowner:
    "This account has the Super Admin role but is not the designated owner, so access was denied. Ask the owner to change its role.",
  role: "Your account does not have a CRM role. Contact an administrator.",
  pending: "Your account is awaiting administrator approval.",
  suspended: "Your account is suspended. Contact an administrator.",
  blocked: "Your account has been blocked. Contact an administrator.",
  deactivated: "Your account is no longer active.",
  callback: "The secure email link is invalid or has expired.",
  signed_out: "You have been signed out securely.",
  password_updated: "Your password was updated. Sign in with the new password.",
};

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/crm/dashboard";
}

export function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isSupabaseConfigured();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const reason = searchParams.get("reason") || "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const client = createBrowserSupabaseClient();
    if (!client) {
      setError("Supabase is not configured for this deployment.");
      setBusy(false);
      return;
    }

    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    const confirmation = String(values.get("confirmation") || "");

    try {
      if (mode === "login") {
        const { error: signInError } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        const { data: access, error: accessError } = await client.rpc(
          "get_access_context",
          { p_platform: "web" },
        );
        if (
          accessError ||
          access?.profile?.status !== "active" ||
          access?.system_lock?.locked === true ||
          !access?.modules?.some(
            (module: { can_view: boolean }) => module.can_view === true,
          )
        ) {
          await client.auth.signOut({ scope: "local" });
          throw new Error(
            accessError?.message ||
              access?.system_lock?.message ||
              "Your session has no workspace access.",
          );
        }
        router.replace(safeNext(searchParams.get("next")));
        router.refresh();
        return;
      }

      if (mode === "signup") {
        if (password.length < 8)
          throw new Error("Use at least 8 characters for your password.");
        if (password !== confirmation)
          throw new Error("The passwords do not match.");
        const { error: signUpError } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(values.get("fullName") || "").trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/crm/dashboard`,
          },
        });
        if (signUpError) throw signUpError;
        await client.auth.signOut({ scope: "local" });
        setSuccess(
          "Account request received. Confirm your email, then wait for administrator approval.",
        );
      }

      if (mode === "forgot") {
        const { error: resetError } = await client.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
          },
        );
        if (resetError) throw resetError;
        setSuccess(
          "If that account exists, a secure password-reset link has been sent.",
        );
      }

      if (mode === "reset") {
        if (password.length < 8)
          throw new Error("Use at least 8 characters for your password.");
        if (password !== confirmation)
          throw new Error("The passwords do not match.");
        const { error: updateError } = await client.auth.updateUser({
          password,
        });
        if (updateError)
          throw new Error("This recovery session is invalid or has expired.");
        await client.auth.signOut({ scope: "local" });
        router.replace("/login?reason=password_updated");
        router.refresh();
        return;
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const title = {
    login: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  }[mode];

  return (
    <main className="login">
      <div className="login-wrap">
        <section className="login-hero">
          <div className="brand-mark">CD</div>
          <div className="eyebrow" style={{ color: "#9ec0ff", marginTop: 28 }}>
            CRM Development
          </div>
          <h1>The business, from first call to final fitting.</h1>
          <p>
            Secure Supabase access for sales, jobs, warehouse, installers and
            billing.
          </p>
        </section>
        <section className="login-panel">
          <div className="eyebrow">Secure company access</div>
          <h2>{title}</h2>
          {!configured && (
            <div className="login-error">
              Supabase environment values are missing.
            </div>
          )}
          {reason && (
            <div className="login-error">
              {reasonMessages[reason] || "Your account could not be verified."}
            </div>
          )}
          {success ? (
            <>
              <p>{success}</p>
              <Link className="btn" href="/login">
                Return to sign in
              </Link>
            </>
          ) : (
            <form className="form-stack" onSubmit={submit}>
              {mode === "signup" && (
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <input
                    className="input"
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    required
                  />
                </div>
              )}
              {mode !== "reset" && (
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    className="input"
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </div>
              )}
              {mode !== "forgot" && (
                <div className="field">
                  <label htmlFor="password">
                    {mode === "login" ? "Password" : "New password"}
                  </label>
                  <input
                    className="input"
                    id="password"
                    name="password"
                    type="password"
                    minLength={mode === "login" ? undefined : 8}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                  />
                </div>
              )}
              {(mode === "signup" || mode === "reset") && (
                <div className="field">
                  <label htmlFor="confirmation">Confirm password</label>
                  <input
                    className="input"
                    id="confirmation"
                    name="confirmation"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}
              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="btn"
                disabled={busy || !configured}
                type="submit"
              >
                {busy ? "Please wait…" : title}
              </button>
            </form>
          )}
          <div className="center muted small mt12">
            {mode === "login" ? (
              <>
                <Link href="/forgot-password">Forgot password?</Link> ·{" "}
                <Link href="/signup">Create account</Link>
              </>
            ) : (
              <Link href="/login">Back to sign in</Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
