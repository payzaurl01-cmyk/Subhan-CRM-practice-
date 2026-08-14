"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, MailCheck } from "lucide-react";
import { AuthBrand } from "@/features/auth/auth-brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();

  async function requestReset(formData: FormData) {
    const client = createBrowserSupabaseClient();
    if (!client) {
      setError("Password recovery is temporarily unavailable. Please contact the system administrator.");
      return;
    }

    setLoading(true);
    setError("");
    const { error: resetError } = await client.auth.resetPasswordForEmail(
      String(formData.get("email")).trim(),
      { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` },
    );

    if (resetError) {
      setError("We couldn’t send the recovery email. Please try again shortly.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="login-card">
      <AuthBrand />
      {sent ? (
        <div className="auth-success">
          <span><MailCheck size={28}/></span>
          <h1>Check your inbox</h1>
          <p>If an account exists for that email address, a secure password-reset link has been sent.</p>
          <Link className="primary-button login-submit" href="/login">Return to sign in <ArrowRight size={19}/></Link>
        </div>
      ) : (
        <>
          <div className="login-copy"><h1>Reset your password</h1><p>Enter your work email and we’ll send a secure recovery link.</p></div>
          {!configured && <div className="setup-message"><b>Application setup required</b><span>Password recovery is temporarily unavailable. Please contact the system administrator.</span></div>}
          <form action={requestReset}>
            <label>Email address<div className="input-with-icon"><Mail size={20}/><input name="email" type="email" required placeholder="you@company.co.uk" autoComplete="email"/></div></label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button login-submit" disabled={loading || !configured}>{loading ? "Sending link…" : "Send recovery link"}<ArrowRight size={19}/></button>
          </form>
          <p className="auth-switch"><Link href="/login"><ArrowLeft size={15}/> Back to sign in</Link></p>
        </>
      )}
    </div>
  );
}
