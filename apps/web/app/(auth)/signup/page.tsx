"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacySignupRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/signin");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center text-sm text-slate-600 shadow">
        Redirecting to sign in…
      </div>
    </main>
  );
}
