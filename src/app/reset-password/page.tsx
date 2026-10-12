import { Suspense } from "react";
import { AuthPage } from "@/features/auth/AuthPage";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthPage mode="reset" />
    </Suspense>
  );
}
