import 'server-only';
import { AiConfigResponse, GmailConnectionSummary, ProjectStats } from '@email-automation/shared';
import { API_BASE_URL } from './config';

async function apiFetch<T>(path: string, sessionToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'x-session-token': sessionToken
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  return (await response.json()) as T;
}

export async function getGmailConnections(
  projectId: string,
  sessionToken: string
): Promise<GmailConnectionSummary[]> {
  return apiFetch<GmailConnectionSummary[]>(`/v1/projects/${projectId}/gmail/connections`, sessionToken);
}

export async function getProjectStats(
  projectId: string,
  sessionToken: string
): Promise<ProjectStats> {
  return apiFetch<ProjectStats>(`/v1/projects/${projectId}/stats`, sessionToken);
}

export async function getGmailOAuthUrl(
  projectId: string,
  sessionToken: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/gmail/oauth/url`, {
    method: 'GET',
    headers: {
      'x-session-token': sessionToken
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  const result = (await response.json()) as { url: string };
  return result.url;
}

export async function getAiConfig(sessionToken: string): Promise<AiConfigResponse> {
  return apiFetch<AiConfigResponse>(`/v1/organizations/me/ai-config`, sessionToken);
}

export async function updateAiConfig(
  sessionToken: string,
  payload: Partial<{
    defaultProvider: string;
    providers: Record<string, { apiKey?: string | null; model?: string | null }>;
  }>
): Promise<AiConfigResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/organizations/me/ai-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': sessionToken
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  return (await response.json()) as AiConfigResponse;
}
