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
      <div className="w-full max-w-md border-2 border-volta-dark bg-volta-surface p-8 shadow-neo-lg">
        <span className="inline-flex border-2 border-volta-dark bg-volta-accent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark shadow-neo-sm">
          Sign In
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-volta-dark">Sign in to VoltaMail</h1>
        <p className="mt-2 text-sm text-volta-stone-700">
          VoltaMail uses Google Workspace accounts for authentication.
        </p>
        {error ? <p className="mt-4 text-sm font-bold text-volta-danger">{error}</p> : null}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="mt-6 flex w-full items-center justify-center gap-2 border-2 border-volta-dark bg-volta-surface px-4 py-2 text-sm font-bold text-volta-dark shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-neo-sm disabled:hover:translate-x-0 disabled:hover:translate-y-0"
        >
          {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
        </button>
        <p className="mt-4 text-center font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-stone-500">
          By continuing you agree to the VoltaMail Terms of Service.
        </p>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md border-2 border-volta-dark bg-volta-surface p-8 text-center text-sm text-volta-stone-700 shadow-neo">
        Preparing sign-in…
      </div>
    </main>
  );
}
