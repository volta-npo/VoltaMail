export const APP_NAME = 'VoltaMail';

export type OrganizationRole = 'OWNER' | 'MANAGER' | 'WRITER' | 'VIEWER';

export interface OrganizationSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  organizationId: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: OrganizationRole;
}

export interface SessionProjectSummary {
  id: string;
  name: string;
  timezone: string;
  role: 'OWNER' | 'MANAGER' | 'WRITER' | 'VIEWER';
}

export interface SessionPayload {
  sessionToken: string;
  sessionExpiresAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    organizationRole: OrganizationRole;
  };
  organization: {
    id: string;
    name: string;
    plan: string;
  };
  projects: SessionProjectSummary[];
}

export interface GmailConnectionSummary {
  id: string;
  email: string;
  connectedAt: string;
  scopes: string[];
  needsReauth?: boolean;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

export interface LeadImportRowResult {
  email: string | null;
  status: 'imported' | 'skipped' | 'invalid';
  reason?: string;
}

export interface LeadImportSummary {
  inserted: number;
  skipped: number;
  invalid: number;
  rows: LeadImportRowResult[];
}

export interface LeadSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  role: string | null;
  status: 'IMPORTED' | 'INVALID' | 'DUPLICATE';
  createdAt: string;
  updatedAt: string;
}

export interface TemplateSummary {
  id: string;
  projectId: string;
  name: string;
  subject: string;
  body: string;
  activeVersion?: TemplateVersionSummary | null;
  versions?: TemplateVersionSummary[];
  createdAt: string;
  updatedAt: string;
}

export type TemplateVersionType = 'TEXT' | 'HTML';
export type TemplateVersionSource = 'AI' | 'USER';

export interface TemplateVersionSummary {
  id: string;
  templateId: string;
  parentVersionId?: string | null;
  type: TemplateVersionType;
  source: TemplateVersionSource;
  title: string;
  description?: string | null;
  htmlContent?: string | null;
  textContent?: string | null;
  metadata?: Record<string, unknown> | null;
  isActive: boolean;
  createdByAiProvider?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenderedLeadPreview {
  leadId: string;
  email: string;
  subject: string;
  body: string;
}

export interface AiDraftResult {
  leadId: string;
  email: string;
  subject: string;
  body: string;
  provider: string;
  html?: string | null;
  templateVersionId?: string | null;
  notes?: string;
}

export interface SendDraftResponse {
  messageId: string;
  sentAt: string;
  gmailConnectionId: string;
  gmailConnectionEmail: string;
}

export interface ProjectStats {
  leadCount: number;
  sentCount: number;
  draftsReady: number;
  templateCount: number;
  gmailConnectionCount: number;
}

export interface AiTemplateSuggestion {
  subject: string;
  body: string;
}

export type AiProvider = 'openrouter' | 'openai' | 'gemini';

export interface AiProviderSettings {
  hasKey: boolean;
  model: string | null;
}

export interface AiConfigResponse {
  defaultProvider: AiProvider;
  providers: Record<AiProvider, AiProviderSettings>;
}

export interface KnowledgeSource {
  id: string;
  type: 'website' | 'googleDoc' | 'upload';
  url?: string | null;
  title?: string | null;
  summary: string;
  snippet: string;
  createdAt: string;
}

export type AiChatRole = 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatResponse {
  message: string;
  tokensApprox?: number;
}

export interface DraftToSend {
  leadId: string;
  subject: string;
  body: string;
}

export interface BulkSendResult {
  leadId: string;
  status: 'sent' | 'failed';
  messageId?: string;
  sentAt?: string;
  gmailConnectionEmail?: string;
  error?: string;
}

export interface BulkSendResponse {
  results: BulkSendResult[];
}

export interface TemplateIterationRequest {
  versionId: string;
  instructions?: string;
  provider?: 'openrouter' | 'openai' | 'gemini';
  model?: string;
}
