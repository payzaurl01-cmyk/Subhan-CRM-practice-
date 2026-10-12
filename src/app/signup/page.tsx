import { Suspense } from "react";
import { AuthPage } from "@/features/auth/AuthPage";

export default function SignupPage() {
  return (
    <Suspense>
      <AuthPage mode="signup" />
    </Suspense>
  );
}
