"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MailCheck, UserRound } from "lucide-react";
import { AuthBrand } from "@/features/auth/auth-brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function SignupForm() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const configured = isSupabaseConfigured();

  async function signUp(formData: FormData) {
    const fullName = String(formData.get("fullName")).trim();
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const confirmation = String(formData.get("confirmation"));

    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    const client = createBrowserSupabaseClient();
    if (!client) {
      setError("Secure account creation is temporarily unavailable. Please contact the system administrator.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (signUpError) {
      setError(signUpError.message || "We couldn’t create your account. Please try again.");
      setLoading(false);
      return;
    }

    if (data.session) await client.auth.signOut();
    setRegisteredEmail(email);
    setLoading(false);
  }

  if (registeredEmail) {
    return (
      <div className="login-card">
        <AuthBrand />
        <div className="auth-success">
          <span><MailCheck size={28} /></span>
          <h1>Account request received</h1>
          <p>We sent a verification link to <strong>{registeredEmail}</strong> when email confirmation is enabled.</p>
          <p>Your account also requires administrator approval before CRM access is granted.</p>
          <Link className="primary-button login-submit" href="/login">Return to sign in <ArrowRight size={19} /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-card auth-card-long">
      <AuthBrand />
      <div className="login-copy"><h1>Create your account</h1><p>Request secure access to the operations workspace.</p></div>
      {!configured && <div className="setup-message"><b>Application setup required</b><span>Account creation is temporarily unavailable. Please contact the system administrator.</span></div>}
      <form action={signUp}>
        <label>Full name<div className="input-with-icon"><UserRound size={20}/><input name="fullName" required placeholder="Your full name" autoComplete="name"/></div></label>
        <label>Email address<div className="input-with-icon"><Mail size={20}/><input name="email" type="email" required placeholder="you@company.co.uk" autoComplete="email"/></div></label>
        <label>Password<div className="input-with-icon"><LockKeyhole size={20}/><input name="password" type={visible ? "text" : "password"} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password"/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide passwords" : "Show passwords"}>{visible ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label>
        <label>Confirm password<div className="input-with-icon"><LockKeyhole size={20}/><input name="confirmation" type={visible ? "text" : "password"} required minLength={8} placeholder="Enter the password again" autoComplete="new-password"/></div></label>
        <p className="auth-help">New accounts remain pending until an administrator approves access.</p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button login-submit" disabled={loading || !configured}>{loading ? "Creating account…" : "Create account"}<ArrowRight size={19}/></button>
      </form>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </div>
  );
}
