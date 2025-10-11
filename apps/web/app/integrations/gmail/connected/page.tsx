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
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">
          {success ? 'Gmail Connected' : 'Connection Failed'}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {success
            ? email
              ? `The Gmail account ${email} is now connected. You can start sending campaigns from the dashboard.`
              : 'Your Gmail account is now connected. You can start sending campaigns from the dashboard.'
            : message ?? 'We were unable to connect your Gmail account. Please try again.'}
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/dashboard"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
