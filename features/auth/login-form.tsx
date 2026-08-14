"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();
  const reason = searchParams.get("reason");

  async function signIn(formData: FormData) {
    setLoading(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      router.push("/dashboard");
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email")),
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
      <div className="login-brand"><span className="login-logo"><Image src="/logo.jpeg" alt="Interior Blinds & Shutters" width={300} height={300} preload /></span><div><strong>Interior Blinds</strong><small>Operations CRM</small></div></div>
      <div className="login-copy"><h1>Welcome back</h1><p>Sign in to manage sales, jobs and operations.</p></div>
      {reason && <div className="auth-message">Your account or profile could not be verified. Contact an administrator.</div>}
      {!configured && <div className="demo-message"><b>Preview mode is ready</b><span>Connect Supabase later using the two variables in <code>.env.example</code>.</span></div>}
      <form action={signIn}>
        <label>Email address<div className="input-with-icon"><Mail size={17}/><input name="email" type="email" required defaultValue={configured ? "" : "alex@interiorblinds.co.uk"} placeholder="you@company.co.uk" autoComplete="email"/></div></label>
        <label>Password<div className="input-with-icon"><LockKeyhole size={17}/><input name="password" type={visible ? "text" : "password"} required defaultValue={configured ? "" : "preview123"} placeholder="Enter your password" autoComplete="current-password"/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        <div className="login-options"><label><input type="checkbox"/> Remember me</label><Link href="/login">Forgot password?</Link></div>
        {error && <p className="form-error">{error}</p>}
        {configured ? <button className="primary-button login-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={17}/></button> : <Link href="/dashboard" className="primary-button login-submit">Open CRM preview <ArrowRight size={17}/></Link>}
      </form>
      <p className="login-security">Protected by Supabase Auth, Row Level Security and secure cookies.</p>
    </div>
  );
}
