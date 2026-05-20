import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import { authOptions } from '@/lib/auth-options';
import { getAiConfig } from '@/lib/server-api';
import AiSettingsForm from '@/components/ai-settings-form';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/signin');
  }

  if (!session.sessionToken) {
    redirect('/dashboard');
  }

  const config = await getAiConfig(session.sessionToken);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit border-2 border-volta-dark bg-volta-accent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark shadow-neo-sm">
            Organization
          </span>
          <h1 className="font-display text-4xl font-bold tracking-tight text-volta-dark">AI Providers &amp; API Keys</h1>
          <p className="text-sm text-volta-stone-700">
            Manage which model provider powers campaign generation. Add or rotate API keys at any time.
          </p>
        </div>
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center border-2 border-volta-dark bg-volta-surface px-3 py-1.5 text-sm font-bold text-volta-dark shadow-neo-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo active:translate-x-[1px] active:translate-y-[1px]"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <AiSettingsForm initialConfig={config} />
    </main>
  );
}
