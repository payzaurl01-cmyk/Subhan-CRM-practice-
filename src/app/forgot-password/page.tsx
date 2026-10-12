import { Suspense } from "react";
import { AuthPage } from "@/features/auth/AuthPage";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthPage mode="forgot" />
    </Suspense>
  );
}
