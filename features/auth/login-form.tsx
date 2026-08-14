"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { AuthBrand } from "@/features/auth/auth-brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const reasonMessages: Record<string, string> = {
  profile: "Your staff profile is not ready. Contact an administrator for access.",
  pending: "Your account is awaiting administrator approval.",
  suspended: "Your account is suspended. Contact an administrator.",
  blocked: "Your account has been blocked. Contact an administrator.",
  deactivated: "Your account is no longer active.",
  callback: "The secure email link is invalid or has expired. Please try again.",
  signed_out: "You have been signed out securely.",
  password_updated: "Your password has been updated. Sign in with your new password.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();
  const reason = searchParams.get("reason") || "";

  async function signIn(formData: FormData) {
    setLoading(true);
    setError("");
    const client = createBrowserSupabaseClient();
    if (!client) {
      setError("Application configuration is incomplete. Add the environment values to .env.local and restart the server.");
      setLoading(false);
      return;
    }
    const { error: signInError } = await client.auth.signInWithPassword({
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password")),
    });
    if (signInError) {
      setError("We couldn’t sign you in. Check your email and password, then try again.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="login-card">
      <AuthBrand />
      <div className="login-copy"><h1>Welcome back</h1><p>Sign in to manage sales, jobs and operations.</p></div>
      {reason && <div className="auth-message">{reasonMessages[reason] || "Your account could not be verified. Contact an administrator."}</div>}
      {!configured && <div className="setup-message"><b>Application setup required</b><span>Secure sign-in is temporarily unavailable. Please contact the system administrator.</span></div>}
      <form action={signIn}>
        <label>Email address<div className="input-with-icon"><Mail size={20}/><input name="email" type="email" required placeholder="you@company.co.uk" autoComplete="email"/></div></label>
        <label>Password<div className="input-with-icon"><LockKeyhole size={20}/><input name="password" type={visible ? "text" : "password"} required placeholder="Enter your password" autoComplete="current-password"/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label>
        <div className="login-options"><label><input type="checkbox"/> Keep me signed in</label><Link href="/forgot-password">Forgot password?</Link></div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button login-submit" disabled={loading || !configured}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={19}/></button>
      </form>
      <p className="auth-switch">New to the team? <Link href="/signup">Create an account</Link></p>
      <p className="login-security"><ShieldCheck size={14}/> Secure company access · Encrypted session · Role-based permissions</p>
    </div>
  );
}
