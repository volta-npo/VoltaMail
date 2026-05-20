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
      <div className="w-full max-w-md border-2 border-volta-dark bg-volta-surface p-8 text-center text-sm text-volta-stone-700 shadow-neo">
        Redirecting to sign in…
      </div>
    </main>
  );
}
