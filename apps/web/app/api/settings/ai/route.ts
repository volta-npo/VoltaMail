import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { updateAiConfig } from '@/lib/server-api';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const normalizedPayload = {
    ...((payload as Record<string, unknown>) ?? {}),
    defaultProvider: 'gemini'
  };

  try {
    const config = await updateAiConfig(session.sessionToken, normalizedPayload);
    return NextResponse.json({ ...config, defaultProvider: 'gemini' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AI configuration';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
