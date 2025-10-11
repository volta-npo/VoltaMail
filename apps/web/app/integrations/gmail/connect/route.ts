import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { redirect } from 'next/navigation';
import { getGmailOAuthUrl } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.redirect(new URL('/dashboard?error=missing-project', request.nextUrl));
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(request.nextUrl.toString())}`);
  }

  const sessionToken = session.sessionToken;

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/dashboard?error=session', request.nextUrl));
  }

  try {
    const url = await getGmailOAuthUrl(projectId, sessionToken);
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start Gmail OAuth';
    return NextResponse.redirect(
      new URL(`/integrations/gmail/connected?status=error&message=${encodeURIComponent(message)}`, request.nextUrl)
    );
  }
}
