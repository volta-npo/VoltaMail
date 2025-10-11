import { SessionPayload } from '@email-automation/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:4000/api';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || response.statusText, response.status);
  }

  return (await response.json()) as T;
}

export interface SignUpPayload {
  email: string;
  password: string;
  organizationName: string;
  displayName?: string;
  projectName?: string;
}

export async function signUp(payload: SignUpPayload): Promise<SessionPayload> {
  return apiFetch<SessionPayload>('/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function login(payload: { email: string; password: string }): Promise<SessionPayload> {
  return apiFetch<SessionPayload>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export { ApiError };
