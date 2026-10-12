import { Suspense } from "react";
import { AuthPage } from "@/features/auth/AuthPage";

export default function LoginPage() {
  return (
    <Suspense>
      <AuthPage mode="login" />
    </Suspense>
  );
}
