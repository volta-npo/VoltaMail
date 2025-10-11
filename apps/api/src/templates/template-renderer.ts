import { Lead } from '@email-automation/database';

export function renderTemplate(template: string, lead: Lead): string {
  const context = buildContext(lead);
  const pattern = /{{\s*([a-zA-Z0-9_]+)(?:\|([^{}]+))?\s*}}/g;

  return template.replace(pattern, (_match, keyRaw: string, fallbackRaw?: string) => {
    const key = keyRaw.toLowerCase();
    const fallback = fallbackRaw?.trim();
    const value = context[key];
    if (value && value.length > 0) {
      return value;
    }
    return fallback ?? '';
  });
}

function buildContext(lead: Lead): Record<string, string> {
  const context: Record<string, string> = {};

  const assign = (key: string, value?: string | null) => {
    if (value && value.trim().length > 0) {
      context[key] = value.trim();
    }
  };

  assign('email', lead.email);
  assign('first_name', lead.firstName);
  assign('last_name', lead.lastName);
  assign('company', lead.company);
  assign('role', lead.role);
  assign('timezone', lead.timezone);
  assign('phone', lead.phone);
  assign('address', lead.address);

  if (lead.customJson && typeof lead.customJson === 'object' && !Array.isArray(lead.customJson)) {
    Object.entries(lead.customJson as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'string') {
        assign(normalizeKey(key), value);
      } else if (value != null) {
        assign(normalizeKey(key), String(value));
      }
    });
  }

  return context;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
