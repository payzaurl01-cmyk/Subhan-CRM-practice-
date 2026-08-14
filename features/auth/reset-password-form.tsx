"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { AuthBrand } from "@/features/auth/auth-brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ResetPasswordForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const configured = isSupabaseConfigured();

  async function updatePassword(formData: FormData) {
    const password = String(formData.get("password"));
    const confirmation = String(formData.get("confirmation"));
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
      setError("Password reset is temporarily unavailable. Please contact the system administrator.");
      return;
    }

    setLoading(true);
    setError("");
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setError("This recovery link is invalid or has expired. Request a new link and try again.");
      setLoading(false);
      return;
    }
    await client.auth.signOut();
    router.replace("/login?reason=password_updated");
    router.refresh();
  }

  return (
    <div className="login-card">
      <AuthBrand />
      <div className="login-copy"><h1>Choose a new password</h1><p>Create a strong password for your company account.</p></div>
      {!configured && <div className="setup-message"><b>Application setup required</b><span>Password reset is temporarily unavailable. Please contact the system administrator.</span></div>}
      <form action={updatePassword}>
        <label>New password<div className="input-with-icon"><LockKeyhole size={20}/><input name="password" type={visible ? "text" : "password"} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password"/><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide passwords" : "Show passwords"}>{visible ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div></label>
        <label>Confirm new password<div className="input-with-icon"><LockKeyhole size={20}/><input name="confirmation" type={visible ? "text" : "password"} required minLength={8} placeholder="Enter the password again" autoComplete="new-password"/></div></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button login-submit" disabled={loading || !configured}>{loading ? "Updating password…" : "Update password"}<ArrowRight size={19}/></button>
      </form>
      <p className="auth-switch"><Link href="/login">Return to sign in</Link></p>
    </div>
  );
}
