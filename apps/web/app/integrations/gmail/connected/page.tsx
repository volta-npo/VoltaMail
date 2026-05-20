import Link from 'next/link';
import { redirect } from 'next/navigation';

interface ConnectedPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function GmailConnectedPage({ searchParams }: ConnectedPageProps) {
  const status = typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const message =
    typeof searchParams.message === 'string'
      ? decodeURIComponent(searchParams.message)
      : undefined;
  const email = typeof searchParams.email === 'string' ? decodeURIComponent(searchParams.email) : undefined;

  if (!status) {
    redirect('/dashboard');
  }

  const success = status === 'success';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg border-2 border-volta-dark bg-volta-surface p-8 text-center shadow-neo-lg">
        <span
          className={`inline-flex border-2 border-volta-dark px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest shadow-neo-sm ${
            success ? 'bg-volta-success-soft text-volta-success' : 'bg-volta-danger-soft text-volta-danger'
          }`}
        >
          {success ? 'Success' : 'Error'}
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-volta-dark">
          {success ? 'Gmail Connected' : 'Connection Failed'}
        </h1>
        <p className="mt-3 text-sm text-volta-stone-700">
          {success
            ? email
              ? `The Gmail account ${email} is now connected. You can start sending campaigns from the dashboard.`
              : 'Your Gmail account is now connected. You can start sending campaigns from the dashboard.'
            : message ?? 'We were unable to connect your Gmail account. Please try again.'}
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center border-2 border-volta-dark bg-volta-primary px-4 py-2 text-sm font-bold text-white shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
