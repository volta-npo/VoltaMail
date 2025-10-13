const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  'http://localhost:4000/api';

function ensureApiPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'http://localhost:4000/api';
  }

  try {
    const url = new URL(trimmed);
    const currentPath = url.pathname.replace(/\/+$/, '') || '/';

    if (currentPath === '/' || currentPath === '') {
      url.pathname = '/api';
    } else if (!currentPath.startsWith('/api')) {
      url.pathname = `/api${currentPath.startsWith('/') ? currentPath : `/${currentPath}`}`;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    const sanitized = trimmed.replace(/\/+$/, '');
    if (sanitized.endsWith('/api') || sanitized.includes('/api/')) {
      return sanitized;
    }
    return `${sanitized}/api`;
  }
}

export const API_BASE_URL = ensureApiPrefix(rawApiBaseUrl);

