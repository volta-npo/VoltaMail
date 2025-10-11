"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const searchParams = useSearchParams();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    await signIn("google", { callbackUrl });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold text-slate-800">Sign in to VoltaMail</h1>
        <p className="mt-2 text-sm text-slate-600">
          VoltaMail uses Google Workspace accounts for authentication.
        </p>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">
          By continuing you agree to the VoltaMail Terms of Service.
        </p>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center text-sm text-slate-600 shadow">
        Preparing sign-in…
      </div>
    </main>
  );
}
