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
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">Organization</span>
          <h1 className="text-3xl font-semibold text-slate-900">AI Providers &amp; API Keys</h1>
          <p className="text-sm text-slate-600">
            Manage which model provider powers campaign generation. Add or rotate API keys at any time.
          </p>
        </div>
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <AiSettingsForm initialConfig={config} />
    </main>
  );
}
