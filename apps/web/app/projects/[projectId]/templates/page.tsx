"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  AiDraftResult,
  AiProvider,
  AiTemplateSuggestion,
  AiConfigResponse,
  BulkSendResponse,
  GmailConnectionSummary,
  KnowledgeSource,
  LeadSummary,
  SendDraftResponse,
  TemplateSummary,
  TemplateVersionSummary,
  AiChatMessage
} from "@email-automation/shared";
import { TemplateDesigner, defaultDesignerState, TemplateDesignerState, buildHtmlFromDesigner } from "@/components/template-designer";
import TemplateChatPanel from "@/components/template-chat-panel";
import { API_BASE_URL } from "@/lib/config";

type TemplatePreset = {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  subject: string;
  text: string;
  html: string;
};

interface TemplatesPageProps {
  params: {
    projectId: string;
  };
}

interface SentLogEntry {
  leadId: string;
  email: string;
  subject: string;
  messageId: string;
  sentAt: string;
  gmailConnectionEmail: string;
}

interface PersistedState {
  version: number;
  knowledgeBase?: string;
  selectedId?: string | null;
  selectedPresetId?: string | null;
  templateDraft?: {
    name: string;
    subject: string;
    body: string;
  };
  aiProvider?: AiProvider;
  aiDrafts?: AiDraftResult[];
  selectedLeadIds?: string[];
  leadSearch?: string;
  selectedConnectionId?: string;
  sentLog?: SentLogEntry[];
  htmlDraft?: string;
  activeTemplateVersionId?: string | null;
  designerState?: TemplateDesignerState;
  designMode?: 'builder' | 'html';
  strategyNotes?: string;
  htmlSuggestionNotes?: string;
  chatHistory?: AiChatMessage[];
  enhancedPersonalization?: boolean;
  allowToolUse?: boolean;
  bulkSendEnabled?: boolean;
}

const STORAGE_KEY = (projectId: string) => `templates-state-${projectId}`;
const DEFAULT_SUBJECT = "Hi {{first_name|there}} — quick intro";
const DEFAULT_BODY = "{{first_name|there}},\n\nI noticed {{company}} and thought you might be interested in what we do.";

export default function TemplatesPage({ params }: TemplatesPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionToken = session?.sessionToken;
  const projectId = params.projectId;

  const [hydrated, setHydrated] = useState(false);
  const persistedRef = useRef<PersistedState | null>(null);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [aiDrafts, setAiDrafts] = useState<AiDraftResult[] | null>(null);
  const [currentDraftPage, setCurrentDraftPage] = useState(1);
  const draftsPerPage = 10;
const [aiProvider, setAiProvider] = useState<AiProvider | null>(null);
const defaultProviderRef = useRef<AiProvider | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [knowledgeUploadInfo, setKnowledgeUploadInfo] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [googleDocLoading, setGoogleDocLoading] = useState(false);
  const [googleDocError, setGoogleDocError] = useState<string | null>(null);
  const [deleteIntent, setDeleteIntent] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const deletePhrase = 'I am sure I want to delete my knowledge base';
  const [enhancedPersonalization, setEnhancedPersonalization] = useState(false);
  const [allowToolUse, setAllowToolUse] = useState(true);
  const [gmailConnections, setGmailConnections] = useState<GmailConnectionSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [leadOptions, setLeadOptions] = useState<LeadSummary[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadLoadError, setLeadLoadError] = useState<string | null>(null);
  const [sentLog, setSentLog] = useState<SentLogEntry[]>([]);
  const [suggestingTemplate, setSuggestingTemplate] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSendEnabled, setBulkSendEnabled] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState('');
  const [activeTemplateVersionId, setActiveTemplateVersionId] = useState<string | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [htmlSuggestions, setHtmlSuggestions] = useState<TemplateVersionSummary[] | undefined>(undefined);
  const [iteratingDraftId, setIteratingDraftId] = useState<string | null>(null);
  const [bulkIterating, setBulkIterating] = useState(false);
  const [htmlSuggestionNotes, setHtmlSuggestionNotes] = useState('');
  const [iterationNotes, setIterationNotes] = useState('');
  const [designerState, setDesignerState] = useState<TemplateDesignerState>(defaultDesignerState);
  const [designerPreviewHtml, setDesignerPreviewHtml] = useState('');
  const [designerPreviewText, setDesignerPreviewText] = useState('');
  const [designMode, setDesignMode] = useState<'builder' | 'html'>('builder');
  const [templatePresets, setTemplatePresets] = useState<TemplatePreset[]>([]);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetLoading, setPresetLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [strategyNotes, setStrategyNotes] = useState('');
  const [vibeNotes, setVibeNotes] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<AiChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const resetEditorToDefaults = useCallback(() => {
    setSelectedId(null);
    selectedIdRef.current = null;
    setName("Welcome email");
    setSubject(DEFAULT_SUBJECT);
    setBody(DEFAULT_BODY);
    setHtmlDraft('');
    setActiveTemplateVersionId(null);
    setDesignerState(defaultDesignerState);
    setDesignerPreviewHtml('');
    setDesignerPreviewText('');
    setDesignMode('builder');
    setAiDrafts(null);
    setSelectedLeadIds([]);
    setSentLog([]);
    setStrategyNotes('');
    setHtmlSuggestionNotes('');
    setChatHistory([]);
    setChatError(null);
    setIterationNotes('');
    setVibeNotes({});
    setEnhancedPersonalization(false);
    setAllowToolUse(true);
    setBulkSendEnabled(false);
    setTemplatePresets([]);
    setSelectedPresetId(null);
    setHtmlSuggestions(undefined);
  }, []);

  const hydrateEditorFromTemplate = useCallback((template: TemplateSummary) => {
    setSelectedId(template.id);
    selectedIdRef.current = template.id;
    setName(template.name);
    setSubject(template.subject);
    setBody(template.activeVersion?.textContent ?? template.body);
    setHtmlDraft(template.activeVersion?.htmlContent ?? '');
    setActiveTemplateVersionId(template.activeVersion?.id ?? null);
    setDesignerState(defaultDesignerState);
    setDesignerPreviewHtml('');
    setDesignerPreviewText('');
    setDesignMode(template.activeVersion?.htmlContent ? 'html' : 'builder');
    setAiDrafts(null);
    setSelectedLeadIds([]);
    setSentLog([]);
    setStrategyNotes('');
    setHtmlSuggestionNotes('');
    setChatHistory([]);
    setChatError(null);
    setIterationNotes('');
    setVibeNotes({});
    setTemplatePresets([]);
    setSelectedPresetId(null);
  }, []);
  const handleDesignerPreview = useCallback((html: string, text: string) => {
    setDesignerPreviewHtml(html);
    setDesignerPreviewText(text);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(projectId));
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        persistedRef.current = parsed;

        if (parsed.knowledgeBase !== undefined) {
          setKnowledgeBase(parsed.knowledgeBase);
        }
        if (parsed.selectedId !== undefined) {
          setSelectedId(parsed.selectedId ?? null);
        }
        if (parsed.templateDraft) {
          setName(parsed.templateDraft.name ?? "");
          setSubject(parsed.templateDraft.subject ?? "");
          setBody(parsed.templateDraft.body ?? "");
        }
        if (parsed.selectedPresetId !== undefined) {
          setSelectedPresetId(parsed.selectedPresetId ?? null);
        }
        const parsedVersion = parsed.version ?? 1;
        const persistedProvider = parsedVersion >= 3 ? parsed.aiProvider ?? null : null;
        if (persistedProvider && persistedProvider !== 'openrouter') {
          setAiProvider(persistedProvider);
        }
      } else {
        persistedRef.current = null;
      }
    } catch (storageError) {
      console.error('Failed to hydrate template state from storage', storageError);
      persistedRef.current = null;
    } finally {
      setHydrated(true);
    }
  }, [projectId]);

  const extractErrorMessage = useCallback(async (response: Response) => {
    const text = await response.text();
    if (!text) {
      return response.statusText || `Request failed with status ${response.status}`;
    }
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      if (typeof parsed.message === 'string' && parsed.message.length > 0) {
        return parsed.message;
      }
      if (typeof parsed.error === 'string' && parsed.error.length > 0) {
        return parsed.error;
      }
    } catch {
      // ignore parse errors
    }
    return text;
  }, []);

  const loadLeads = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    setLoadingLeads(true);
    setLeadLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/leads?limit=100`, {
        method: "GET",
        headers: {
          "x-session-token": sessionToken ?? ""
        }
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const data = (await response.json()) as LeadSummary[];
      setLeadOptions(data);
      setSelectedLeadIds((prev) =>
        prev.filter((id) => data.some((lead) => lead.id === id))
      );
    } catch (loadError) {
      setLeadLoadError(
        loadError instanceof Error ? loadError.message : "Failed to load leads"
      );
    } finally {
      setLoadingLeads(false);
    }
  }, [projectId, sessionToken, extractErrorMessage]);

  const loadAiConfig = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/organizations/me/ai-config`, {
        method: "GET",
        headers: {
          "x-session-token": sessionToken ?? ""
        }
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as AiConfigResponse;
      const geminiHasKey = data.providers.gemini?.hasKey ?? false;
      
      // Set default provider based on what keys are available
      defaultProviderRef.current = geminiHasKey ? 'gemini' : data.defaultProvider;
      
      // Only set aiProvider state if it's null (not set by user or persisted)
      if (aiProvider === null) {
        setAiProvider(defaultProviderRef.current);
      }
    } catch {
      // If we can't load AI config, default to gemini
      defaultProviderRef.current = 'gemini';
      if (aiProvider === null) {
        setAiProvider('gemini');
      }
    }
  }, [sessionToken, aiProvider]);

  const refreshConnections = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/gmail/connections`, {
        method: "GET",
        headers: {
          "x-session-token": sessionToken ?? ""
        }
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as GmailConnectionSummary[];
      setGmailConnections(data);
      if (data.length > 0) {
        setSelectedConnectionId((prev) => {
          const persistedSelection = persistedRef.current?.selectedConnectionId;
          const candidate = prev || persistedSelection;
          if (candidate && data.some((connection) => connection.id === candidate)) {
            return candidate;
          }
          return data[0].id;
        });
      } else {
        setSelectedConnectionId('');
      }
    } catch {
      // ignore connection refresh errors
    }
  }, [projectId, sessionToken]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/signin?callbackUrl=${encodeURIComponent(window.location.href)}`);
    }
  }, [status, router]);

  useEffect(() => {
    if (!sessionToken || !hydrated) {
      return;
    }

    const controller = new AbortController();
    const loadTemplates = async () => {
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/templates`, {
          method: "GET",
          headers: {
            "x-session-token": sessionToken ?? ""
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(await extractErrorMessage(response));
        }

        const data = (await response.json()) as TemplateSummary[];
        setTemplates(data);

        if (data.length === 0) {
          if (!persistedRef.current?.templateDraft) {
            setSelectedId(null);
            setName("Welcome email");
            setSubject("Hi {{first_name|there}} — quick intro");
            setBody("{{first_name|there}},\n\nI noticed {{company}} and thought you might be interested in what we do.");
            setHtmlDraft('');
            setActiveTemplateVersionId(null);
          }
          return;
        }

        const persisted = persistedRef.current;
        const desiredTemplateId = persisted?.selectedId ?? selectedIdRef.current ?? data[0].id;
        const templateMatch = data.find((template) => template.id === desiredTemplateId) ?? data[0];

        setSelectedId((prev) => prev ?? templateMatch.id);

        if (!persisted?.templateDraft || persisted?.selectedId !== templateMatch.id) {
          setName(templateMatch.name);
          setSubject(templateMatch.subject);
          setBody(templateMatch.activeVersion?.textContent ?? templateMatch.body);
        }

        if (persisted?.htmlDraft !== undefined) {
          setHtmlDraft(persisted.htmlDraft);
        } else {
          setHtmlDraft(templateMatch.activeVersion?.htmlContent ?? '');
        }

        setActiveTemplateVersionId(templateMatch.activeVersion?.id ?? null);

        if (!persisted?.designerState) {
          setDesignerState(defaultDesignerState);
        }
        if (!persisted?.designMode) {
          setDesignMode(templateMatch.activeVersion?.htmlContent ? 'html' : 'builder');
        }

        if (!persisted?.aiDrafts) {
          setAiDrafts(null);
        }

        persistedRef.current = null;
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load templates");
        }
      }
    };

    loadTemplates();
    return () => controller.abort();
  }, [sessionToken, projectId, hydrated, extractErrorMessage]);

  useEffect(() => {
    if (!sessionToken || !hydrated) {
      return;
    }

    loadAiConfig();
  }, [sessionToken, hydrated, loadAiConfig]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    const loadKnowledgeBase = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/knowledge-base`, {
          method: "GET",
          headers: {
            "x-session-token": sessionToken ?? ""
          }
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          knowledgeBase?: string;
          sources?: KnowledgeSource[];
        };
        const serverKnowledge = data.knowledgeBase ?? "";
        if (!persistedRef.current || persistedRef.current.knowledgeBase === undefined) {
          setKnowledgeBase((prev) => (prev && prev.trim().length > 0 ? prev : serverKnowledge));
        }
        if (Array.isArray(data.sources)) {
          setKnowledgeSources(data.sources);
        }
      } catch {
        // ignore
      }
    };

    loadKnowledgeBase();
    refreshConnections();
  }, [sessionToken, projectId, refreshConnections]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    setPresetLoading(false);
    setPresetError(null);
    setTemplatePresets([]);
  }, [sessionToken, projectId]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    loadLeads().catch(() => {
      // errors handled inside loadLeads
    });
  }, [sessionToken, loadLeads]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    const payload: PersistedState = {
      version: 1,
      knowledgeBase,
      selectedId,
      selectedPresetId,
      templateDraft: {
        name,
        subject,
        body
      },
      aiProvider: aiProvider ?? undefined,
      aiDrafts: aiDrafts ?? undefined,
      selectedLeadIds: selectedLeadIds.length > 0 ? selectedLeadIds : undefined,
      leadSearch: leadSearch ? leadSearch : undefined,
      selectedConnectionId: selectedConnectionId ? selectedConnectionId : undefined,
      sentLog: sentLog.length > 0 ? sentLog.slice(0, 20) : undefined,
      htmlDraft,
      activeTemplateVersionId,
      designerState,
      designMode,
      strategyNotes: strategyNotes || undefined,
      htmlSuggestionNotes: htmlSuggestionNotes || undefined,
      chatHistory: chatHistory.length > 0 ? chatHistory.slice(-20) : undefined,
      enhancedPersonalization: enhancedPersonalization || undefined,
      allowToolUse: enhancedPersonalization ? allowToolUse : undefined,
      bulkSendEnabled: bulkSendEnabled || undefined
    };

    persistedRef.current = payload;

    try {
      window.localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(payload));
    } catch (storageError) {
      console.error('Failed to persist template state', storageError);
    }
  }, [
    hydrated,
    projectId,
    knowledgeBase,
    selectedId,
    name,
    subject,
    body,
    aiProvider,
    aiDrafts,
    selectedLeadIds,
    leadSearch,
    selectedConnectionId,
    sentLog,
    htmlDraft,
    activeTemplateVersionId,
    designerState,
    designMode,
    selectedPresetId,
    strategyNotes,
    htmlSuggestionNotes,
    chatHistory,
    enhancedPersonalization,
    allowToolUse,
    bulkSendEnabled
  ]);

  const filteredLeads = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    if (!query) {
      return leadOptions;
    }
    return leadOptions.filter((lead) => {
      const haystacks = [
        lead.email,
        lead.firstName ?? '',
        lead.lastName ?? '',
        lead.company ?? ''
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [leadOptions, leadSearch]);

  const selectedTemplate = useMemo(() => {
    if (!selectedId) {
      return null;
    }
    return templates.find((template) => template.id === selectedId) ?? null;
  }, [templates, selectedId]);

  useEffect(() => {
    if (!success || !/sent/i.test(success)) {
      return;
    }

    let cancelled = false;
    void import('canvas-confetti')
      .then(({ default: confetti }) => {
        if (cancelled) {
          return;
        }
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.7 }
        });
      })
      .catch(() => {
        // ignore confetti load failures
      });

    return () => {
      cancelled = true;
    };
  }, [success]);

  const selectedPreset = useMemo(() => {
    if (!selectedPresetId) {
      return null;
    }
    return templatePresets.find((preset) => preset.id === selectedPresetId) ?? null;
  }, [templatePresets, selectedPresetId]);

  const activeVersion = useMemo(() => {
    if (!selectedTemplate) {
      return null;
    }
    if (activeTemplateVersionId) {
      const match = selectedTemplate.versions?.find((version) => version.id === activeTemplateVersionId);
      if (match) {
        return match;
      }
    }
    return selectedTemplate.activeVersion ?? null;
  }, [selectedTemplate, activeTemplateVersionId]);

  const activeVersionTitle = activeVersion?.title ?? 'Untitled';
  const activeVersionSourceLabel = activeVersion?.source === 'AI' ? 'AI' : 'Human';
  const activeVersionUpdatedLabel = activeVersion?.updatedAt
    ? new Date(activeVersion.updatedAt).toLocaleString()
    : 'Unknown';

  const builderPreviewHtml = useMemo(() => {
    return designerPreviewHtml || buildHtmlFromDesigner(designerState).html;
  }, [designerPreviewHtml, designerState]);

  const builderPreviewText = useMemo(() => {
    return designerPreviewText || buildHtmlFromDesigner(designerState).text;
  }, [designerPreviewText, designerState]);

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    );
  };

  const selectAllFiltered = () => {
    setSelectedLeadIds(filteredLeads.map((lead) => lead.id));
  };

  const clearSelectedLeads = () => {
    setSelectedLeadIds([]);
  };

  const selectedLeadCount = selectedLeadIds.length;

  const activeConnection = useMemo(() => {
    if (gmailConnections.length === 0) {
      return null;
    }
    return (
      gmailConnections.find((connection) => connection.id === selectedConnectionId) ??
      gmailConnections[0]
    );
  }, [gmailConnections, selectedConnectionId]);

  const connectionSelectValue = selectedConnectionId || (activeConnection?.id ?? "");
  const handleApplyPreset = (preset: TemplatePreset) => {
    setSelectedPresetId(preset.id);
    setName(preset.name);
    setSubject(preset.subject);
    setBody(preset.text);
    setHtmlDraft(preset.html);
    setDesignMode('html');
    setHtmlSuggestions(undefined);
    setActiveTemplateVersionId(null);
    setSuccess(`Loaded the ${preset.name} preset. Tweak the copy or ask AI to refine it.`);
  };
  const ingestKnowledgeSource = async (payload: {
    type: 'website' | 'googleDoc' | 'upload';
    url?: string;
    title?: string;
    content?: string;
  }) => {
    if (!sessionToken) {
      throw new Error('Missing session. Please refresh and try again.');
    }

    const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/knowledge-base/source`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }

    const data = (await response.json()) as { knowledgeBase: string; source: KnowledgeSource };
    setKnowledgeBase(data.knowledgeBase);
    setKnowledgeSources((prev) => [...prev, data.source]);
    return data;
  };

  const handleKnowledgeSave = async () => {
    if (!sessionToken) return;
    setKnowledgeSaving(true);
    setSuccess(null);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/knowledge-base`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({ knowledgeBase })
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const data = (await response.json()) as {
        knowledgeBase?: string;
        sources?: KnowledgeSource[];
      };
      if (typeof data.knowledgeBase === "string") {
        setKnowledgeBase(data.knowledgeBase);
      }
      if (Array.isArray(data.sources)) {
        setKnowledgeSources(data.sources);
      }
      setSuccess("Brand context saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save knowledge base");
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
      reader.readAsText(file);
    });

  const handleKnowledgeFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;

    setError(null);
    setSuccess(null);
    setKnowledgeUploadInfo(null);

    try {
      let processed = 0;
      for (const file of files) {
        const content = await readFileAsText(file);
        await ingestKnowledgeSource({
          type: 'upload',
          title: file.name,
          content
        });
        processed += 1;
      }
      setKnowledgeUploadInfo(`Added ${processed} document${processed > 1 ? 's' : ''}.`);
      setSuccess(`Processed ${processed} knowledge source${processed > 1 ? 's' : ''}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to import document.');
    } finally {
      event.target.value = '';
    }
  };

  const handleWebsiteScrape = async () => {
    if (!sessionToken) return;
    const trimmed = websiteUrl.trim();
    if (!trimmed) {
      setWebsiteError('Enter a website URL to scrape.');
      return;
    }

    setWebsiteLoading(true);
    setWebsiteError(null);
    setError(null);
    setSuccess(null);
    setKnowledgeUploadInfo(null);

    try {
      await ingestKnowledgeSource({ type: 'website', url: trimmed });
      setWebsiteUrl('');
      setSuccess('Website content summarized and added.');
    } catch (scrapeError) {
      setWebsiteError(
        scrapeError instanceof Error ? scrapeError.message : 'Failed to scrape website content.'
      );
    } finally {
      setWebsiteLoading(false);
    }
  };

  const handleGoogleDocImport = async () => {
    if (!sessionToken) return;
    const trimmed = googleDocUrl.trim();
    if (!trimmed) {
      setGoogleDocError('Enter a Google Doc link.');
      return;
    }

    setGoogleDocLoading(true);
    setGoogleDocError(null);
    setError(null);
    setSuccess(null);
    setKnowledgeUploadInfo(null);

    try {
      await ingestKnowledgeSource({ type: 'googleDoc', url: trimmed });
      setGoogleDocUrl('');
      setSuccess('Linked Google Doc summarized and added.');
    } catch (docError) {
      setGoogleDocError(
        docError instanceof Error ? docError.message : 'Failed to import Google Doc content.'
      );
    } finally {
      setGoogleDocLoading(false);
    }
  };

  const handleCreate = async (overrides?: {
    name?: string;
    subject?: string;
    body?: string;
    suppressToast?: boolean;
  }): Promise<TemplateSummary | null> => {
    const payloadName = overrides?.name ?? name;
    const payloadSubject = overrides?.subject ?? subject;
    const payloadBody = overrides?.body ?? body;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
            "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({ name: payloadName, subject: payloadSubject, body: payloadBody })
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const created = (await response.json()) as TemplateSummary;
      setTemplates((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setName(created.name);
      setSubject(created.subject);
      setBody(created.activeVersion?.textContent ?? created.body);
      if (!overrides?.suppressToast) {
        setSuccess("Template created.");
      }
      return created;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create template");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (overrides?: {
    name?: string;
    subject?: string;
    body?: string;
    suppressToast?: boolean;
  }): Promise<TemplateSummary | null> => {
    if (!selectedId) {
      return handleCreate(overrides);
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    const payloadName = overrides?.name ?? name;
    const payloadSubject = overrides?.subject ?? subject;
    const payloadBody = overrides?.body ?? body;
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
            "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({ name: payloadName, subject: payloadSubject, body: payloadBody })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const updated = (await response.json()) as TemplateSummary;
      setTemplates((prev) => prev.map((template) => (template.id === updated.id ? updated : template)));
      setName(updated.name);
      setSubject(updated.subject);
      setBody(updated.activeVersion?.textContent ?? updated.body);
      if (!overrides?.suppressToast) {
        setSuccess("Template saved.");
      }
      return updated;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save template");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDrafts = async (leadIds?: string[]) => {
    if (!selectedId) {
      const created = await handleCreate({ suppressToast: true });
      if (!created) {
        return;
      }
      setSelectedId(created.id);
    } else {
      const saved = await handleSave({ suppressToast: true });
      if (!saved) {
        return;
      }
    }

    const effectiveLeadIds = leadIds ?? (selectedLeadIds.length > 0 ? selectedLeadIds : undefined);
    
    if (!effectiveLeadIds || effectiveLeadIds.length === 0) {
      setError('Select leads before generating drafts.');
      return;
    }

    setError(null);
    setSuccess(null);
    setGeneratingAi(true);

    try {
      // Get the selected leads data
      const leadsToGenerate = leadOptions.filter(lead => effectiveLeadIds.includes(lead.id));
      
      if (leadsToGenerate.length === 0) {
        throw new Error('No leads found');
      }

      // Simple template variable replacement - no AI needed
      const drafts: AiDraftResult[] = leadsToGenerate.map(lead => {
        let renderedSubject = subject;
        let renderedBody = body;
        let renderedHtml = htmlDraft;

        const customFields = (lead as Partial<LeadSummary> & { customJson?: Record<string, unknown> | null }).customJson;

        // Replace {{variable}} and {{variable|fallback}} patterns
        const replaceVariables = (text: string) => {
          return text.replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (match, varName, fallback) => {
            const trimmedVar = varName.trim();
            let value: string | null = null;

            // Check lead properties
            if (trimmedVar === 'first_name' || trimmedVar === 'firstName') value = lead.firstName;
            else if (trimmedVar === 'last_name' || trimmedVar === 'lastName') value = lead.lastName;
            else if (trimmedVar === 'email') value = lead.email;
            else if (trimmedVar === 'company') value = lead.company;
            else if (trimmedVar === 'role') value = lead.role;
            // Check custom fields
            else if (customFields && typeof customFields === 'object') {
              value = customFields[trimmedVar] as string | null;
            }

            // Return value or fallback or original
            return value ?? (fallback?.trim() || match);
          });
        };

        renderedSubject = replaceVariables(renderedSubject);
        renderedBody = replaceVariables(renderedBody);
        if (renderedHtml) {
          renderedHtml = replaceVariables(renderedHtml);
        }

        return {
          leadId: lead.id,
          email: lead.email,
          subject: renderedSubject,
          body: renderedBody,
          html: renderedHtml || null,
          provider: 'template',
          templateVersionId: activeVersion?.id ?? activeTemplateVersionId ?? undefined
        };
      });

      setAiDrafts(drafts);
      setCurrentDraftPage(1);
      setSuccess(`Generated ${drafts.length} draft${drafts.length === 1 ? '' : 's'} from template.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate drafts';
      setError(errorMessage);
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleRegenerateDraft = async (leadId: string) => {
    await handleGenerateDrafts([leadId]);
  };

  const handleChatSend = async (message: string) => {
    if (!sessionToken) {
      setChatError("Your session expired. Please refresh and sign in again.");
      return;
    }

    let templateId = selectedId;
    if (!templateId) {
      const created = await handleCreate({ suppressToast: true });
      if (!created) {
        setChatError("Save your template before chatting.");
        return;
      }
      templateId = created.id;
      setSelectedId(created.id);
    } else {
      const saved = await handleSave({ suppressToast: true });
      if (!saved) {
        setChatError("Save your template before chatting.");
        return;
      }
    }

    setChatError(null);
    const userMessage: AiChatMessage = { role: "user", content: message };
    const nextHistory: AiChatMessage[] = [...chatHistory, userMessage];
    setChatHistory(nextHistory);
    setChatLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000); // 28 second timeout (Heroku 30s limit - 2s buffer)

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${templateId}/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          message,
          history: nextHistory.slice(0, -1)
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const data = (await response.json()) as { message: string; updates?: { subject?: string; body?: string; html?: string | null } };
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: (data.message ?? "").trim(),
          updates: data.updates
        }
      ]);
    } catch (chatErr) {
      let errorMessage = "Chat request failed";
      if (chatErr instanceof Error) {
        if (chatErr.name === 'AbortError') {
          errorMessage = "Chat request timed out. The AI took too long. Try simplifying your message or the template.";
        } else {
          errorMessage = chatErr.message;
        }
      }
      setChatError(errorMessage);
      setChatHistory((prev) => prev.slice(0, Math.max(prev.length - 1, 0)));
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
    }
  };

  const handleApplyChatUpdates = (updates: NonNullable<AiChatMessage['updates']>) => {
    if (updates.subject) {
      setSubject(updates.subject);
    }
    if (updates.body) {
      setBody(updates.body);
    }
    if (typeof updates.html === 'string') {
      setHtmlDraft(updates.html);
    }
    setSuccess('Applied AI suggestions to your template.');
  };

  const handleGenerateAiTemplateBundle = async (options?: { designOnly?: boolean }) => {
    if (!sessionToken) {
      return;
    }

    if (options?.designOnly) {
      setError("Template Studio visuals are coming soon.");
      return;
    }

    if (leadOptions.length === 0) {
      setError('Import leads before asking AI to draft a template.');
      return;
    }

    setSuggestingTemplate(true);
    setError(null);
    setSuccess(null);

    const provider = resolveProvider();
    if (!provider) {
      setSuggestingTemplate(false);
      setError('AI provider still loading. Please wait a moment and try again.');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000); // 28 second timeout (Heroku 30s limit - 2s buffer)

    try {
      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/templates/suggest`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries({
              provider,
          knowledgeBase: knowledgeBase.trim().length > 0 ? knowledgeBase : undefined,
          instructions: strategyNotes.trim().length > 0 ? strategyNotes.trim() : undefined
            }).filter(([, value]) => value !== undefined)
          )
        )
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      if ((provider === 'gemini' && response.body) || (provider === 'openrouter' && response.body)) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let doneReading = false;
        while (!doneReading) {
          const { value, done } = await reader.read();
          doneReading = done;
          if (value) {
            accumulated += decoder.decode(value, { stream: !done });
          }
        }

        const trimmed = accumulated.trim();
        if (!trimmed) {
          throw new Error('Empty streamed AI response.');
        }

        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.subject && parsed.subject.trim().length > 0) {
            setSubject(parsed.subject);
          }
          if (parsed.body && parsed.body.trim().length > 0) {
            setBody(parsed.body);
          }
          if (!name || name.trim().length === 0) {
            setName('AI Draft');
          }
          setSuccess('Drafted template copy with AI. Review and tweak before saving.');
          return;
        } catch {
          throw new Error('Failed to parse streamed AI response.');
        }
      }

      const suggestion = (await response.json()) as AiTemplateSuggestion;
      if (suggestion.subject && suggestion.subject.trim().length > 0) {
        setSubject(suggestion.subject);
      }
      if (suggestion.body && suggestion.body.trim().length > 0) {
        setBody(suggestion.body);
      }
      if (!name || name.trim().length === 0) {
        setName('AI Draft');
      }
      setSuccess('Drafted template copy with AI. Review and tweak before saving.');
    } catch (bundleError) {
      let errorMessage = "Failed to generate AI template";
      if (bundleError instanceof Error) {
        if (bundleError.name === 'AbortError') {
          errorMessage = "AI request timed out. The AI provider took too long. Try reducing the number of leads, simplifying your knowledge base, or switching to a different AI provider.";
        } else {
          // Check if the error message contains helpful backend info
          const msg = bundleError.message;
          if (msg.includes("Import leads")) {
            errorMessage = "⚠️ No leads imported. Please import leads first before asking AI to draft a template.";
          } else if (msg.includes("API key") || msg.includes("not configured")) {
            errorMessage = `⚠️ AI API key not configured. Go to Settings → AI Config to add your API key.`;
          } else {
            errorMessage = msg;
          }
        }
      }
      setError(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setSuggestingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedId) {
      setError('Select a template before deleting.');
      return;
    }

    const templateToDelete = templates.find((template) => template.id === selectedId);
    if (!templateToDelete) {
      setError('Selected template could not be found.');
      return;
    }

    const confirmed = window.confirm(`Delete "${templateToDelete.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingTemplate(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}`, {
        method: 'DELETE',
        headers: {
          'x-session-token': sessionToken ?? ''
        }
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const nextTemplates = templates.filter((template) => template.id !== selectedId);
      setTemplates(nextTemplates);

      if (nextTemplates.length > 0) {
        hydrateEditorFromTemplate(nextTemplates[0]);
      } else {
        resetEditorToDefaults();
      }

      persistedRef.current = null;
      setSuccess('Template deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete template.');
    } finally {
      setDeletingTemplate(false);
    }
  };

  const handleApproveDraft = async (draft: AiDraftResult) => {
    if (!selectedId) {
      return;
    }

    if (!activeConnection) {
      setError("Connect a Gmail account before sending emails.");
      return;
    }

    if (activeConnection.needsReauth) {
      setError("Reconnect your Gmail account to refresh access before sending emails.");
      return;
    }

    setSendingDraftId(draft.leadId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          leadId: draft.leadId,
          subject: draft.subject,
          body: draft.body,
          html: draft.html ?? undefined,
          templateVersionId: draft.templateVersionId ?? activeVersion?.id ?? activeTemplateVersionId ?? undefined,
          gmailConnectionId: selectedConnectionId || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const result = (await response.json()) as SendDraftResponse;

      setAiDrafts((prev) => (prev ? prev.filter((item) => item.leadId !== draft.leadId) : prev));
      setSentLog((prev) => [
        {
          leadId: draft.leadId,
          email: draft.email,
          subject: draft.subject,
          messageId: result.messageId,
          sentAt: result.sentAt,
          gmailConnectionEmail: result.gmailConnectionEmail
        },
        ...prev
      ]);
      setSelectedLeadIds((prev) => prev.filter((id) => id !== draft.leadId));
      setSuccess(`Sent email to ${draft.email}`);
      loadLeads().catch(() => {
        // handled inside loadLeads
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Failed to send email";
      setError(message);
      await refreshConnections();
    } finally {
      setSendingDraftId(null);
    }
  };

  const handleApproveAllDrafts = async () => {
    if (!bulkSendEnabled) {
      return;
    }

    if (!selectedId || !aiDrafts || aiDrafts.length === 0) {
      return;
    }

    if (!activeConnection) {
      setError("Connect a Gmail account before sending emails.");
      return;
    }

    if (activeConnection.needsReauth) {
      setError("Reconnect your Gmail account to refresh access before sending emails.");
      return;
    }

    setBulkSending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/send-bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          drafts: aiDrafts.map((draft) => ({
            leadId: draft.leadId,
            subject: draft.subject,
            body: draft.body,
            html: draft.html ?? undefined,
            templateVersionId: draft.templateVersionId ?? activeVersion?.id ?? activeTemplateVersionId ?? undefined
          })),
          gmailConnectionId: selectedConnectionId || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const result = (await response.json()) as BulkSendResponse;
      const sentLeads = result.results.filter((item) => item.status === 'sent');
      const failed = result.results.filter((item) => item.status === 'failed');

      if (sentLeads.length > 0) {
        setAiDrafts((prev) =>
          prev
            ? prev.filter((draft) => !sentLeads.some((item) => item.leadId === draft.leadId))
            : prev
        );
        setSentLog((prev) => [
          ...sentLeads.map((item) => {
            const draft = aiDrafts.find((d) => d.leadId === item.leadId)!;
            return {
              leadId: draft.leadId,
              email: draft.email,
              subject: draft.subject,
              messageId: item.messageId ?? "",
              sentAt: item.sentAt ?? new Date().toISOString(),
              gmailConnectionEmail: item.gmailConnectionEmail ?? (activeConnection?.email ?? "")
            };
          }),
          ...prev
        ]);
        setSelectedLeadIds((prev) => prev.filter((id) => !sentLeads.some((item) => item.leadId === id)));
        setSuccess(`Sent ${sentLeads.length} email${sentLeads.length === 1 ? '' : 's'} successfully.`);
      }

      if (failed.length > 0) {
        const failedDetails = failed
          .map((item) => {
            const draft = aiDrafts.find((d) => d.leadId === item.leadId);
            const label = draft ? draft.email : item.leadId;
            const reason = item.error ?? 'Unknown error';
            return `${label} (${reason})`;
          })
          .join('; ');
        setError(
          `Failed to send ${failed.length} email${failed.length === 1 ? '' : 's'}. ${failedDetails}`
        );
      } else {
        setError(null);
      }

      if (sentLeads.length > 0) {
        loadLeads().catch(() => {
          // handled internally
        });
      }
    } catch (bulkError) {
      const message = bulkError instanceof Error ? bulkError.message : "Failed to send drafts";
      setError(message);
      await refreshConnections();
    } finally {
      setBulkSending(false);
    }
  };

  const updateTemplateState = useCallback(
    (templateId: string, updater: (template: TemplateSummary) => TemplateSummary) => {
      setTemplates((prev) =>
        prev.map((template) => (template.id === templateId ? updater(template) : template))
      );
    },
    []
  );

  const handleSaveActiveVersion = async () => {
    if (!selectedId) {
      return;
    }

    setSavingVersion(true);
    setError(null);
    setSuccess(null);
    try {
      const effectiveOutput = designMode === 'builder'
        ? buildHtmlFromDesigner(designerState)
        : { html: htmlDraft, text: body };

      if (designMode === 'builder') {
        setHtmlDraft(effectiveOutput.html);
        setBody(effectiveOutput.text);
      }

      if (activeVersion) {
        const response = await fetch(
          `${API_BASE_URL}/v1/templates/${selectedId}/versions/${activeVersion.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-session-token": sessionToken ?? ""
            },
            body: JSON.stringify({
              htmlContent: effectiveOutput.html,
              textContent: effectiveOutput.text,
              title: activeVersion.title
            })
          }
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const updatedVersion = (await response.json()) as TemplateVersionSummary;
        updateTemplateState(selectedId, (template) => {
          const versions = template.versions
            ? template.versions.map((version) =>
                version.id === updatedVersion.id ? updatedVersion : version
              )
            : [updatedVersion];
          return {
            ...template,
            versions,
            activeVersion: updatedVersion.id === template.activeVersion?.id ? updatedVersion : template.activeVersion
          };
        });
        setSuccess("Updated active HTML template.");
      } else {
        // No active version yet, create one and activate it
        const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/versions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-token": sessionToken ?? ""
          },
          body: JSON.stringify({
            title: `${name} HTML`,
            description: "Saved from editor",
            htmlContent: effectiveOutput.html,
            textContent: effectiveOutput.text,
            type: "HTML",
            source: "USER",
            activate: true
          })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const newVersion = (await response.json()) as TemplateVersionSummary;
        setActiveTemplateVersionId(newVersion.id);
        updateTemplateState(selectedId, (template) => {
          const versions = template.versions ? [newVersion, ...template.versions] : [newVersion];
          return {
            ...template,
            versions,
            activeVersion: newVersion
          };
        });
        setSuccess("Created new HTML template version and activated it.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save template version");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleCreateNewVersion = async (activate: boolean) => {
    if (!selectedId) {
      return;
    }

    setSavingVersion(true);
    setError(null);
    setSuccess(null);
    try {
      const effectiveOutput = designMode === 'builder'
        ? buildHtmlFromDesigner(designerState)
        : { html: htmlDraft, text: body };

      if (designMode === 'builder') {
        setHtmlDraft(effectiveOutput.html);
        setBody(effectiveOutput.text);
      }

      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          title: `${name} Concept ${new Date().toLocaleTimeString()}`,
          description: "Saved from editor",
          htmlContent: effectiveOutput.html,
          textContent: effectiveOutput.text,
          type: "HTML",
          source: "USER",
          activate
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const version = (await response.json()) as TemplateVersionSummary;
      if (activate) {
        setActiveTemplateVersionId(version.id);
      }

      updateTemplateState(selectedId, (template) => {
        const existingVersions = template.versions ?? [];
        const mappedVersions = [
          version,
          ...existingVersions.map((item) => (activate ? { ...item, isActive: false } : item))
        ];

        return {
          ...template,
          versions: mappedVersions,
          activeVersion: activate ? version : template.activeVersion
        };
      });
      setSuccess(activate ? "Saved and activated new HTML template version." : "Saved new HTML template version.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save template version");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleActivateVersion = async (versionId: string) => {
    if (!selectedId) {
      return;
    }

    setSavingVersion(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/versions/${versionId}/activate`, {
        method: "POST",
        headers: {
          "x-session-token": sessionToken ?? ""
        }
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const templateSummary = (await response.json()) as TemplateSummary;
      setTemplates((prev) => prev.map((template) => (template.id === templateSummary.id ? templateSummary : template)));
      setActiveTemplateVersionId(templateSummary.activeVersion?.id ?? null);
      setHtmlDraft(templateSummary.activeVersion?.htmlContent ?? htmlDraft);
      setBody(templateSummary.activeVersion?.textContent ?? templateSummary.body);
      setSuccess("Activated template version.");
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Failed to activate version");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleLoadVersionIntoEditor = (version: TemplateVersionSummary) => {
    setHtmlDraft(version.htmlContent ?? '');
    if (version.textContent) {
      setBody(version.textContent);
    }
    setSuccess(`Loaded ${version.title} into editor.`);
    setActiveTemplateVersionId(version.id);
    setDesignMode('html');
  };

  const handleAdoptHtmlSuggestion = async (suggestion: TemplateVersionSummary) => {
    if (!sessionToken || !selectedId) {
      return;
    }

    setSavingVersion(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          title: suggestion.title,
          description: suggestion.description ?? undefined,
          htmlContent: suggestion.htmlContent ?? undefined,
          textContent: suggestion.textContent ?? undefined,
          type: 'HTML',
          source: 'AI',
          createdByAiProvider: aiProvider,
          activate: true
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const version = (await response.json()) as TemplateVersionSummary;
      setHtmlDraft(version.htmlContent ?? '');
      setBody(version.textContent ?? body);
      setActiveTemplateVersionId(version.id);
      updateTemplateState(selectedId, (template) => {
        const versions = template.versions
          ? [version, ...template.versions.map((item) => ({ ...item, isActive: item.id === version.id ? true : false }))]
          : [version];
        return {
          ...template,
          versions,
          activeVersion: version
        };
      });
      setHtmlSuggestions(undefined);
      setSuccess('Adopted AI template design.');
      setDesignMode('html');
    } catch (adoptError) {
      setError(adoptError instanceof Error ? adoptError.message : "Failed to adopt template design");
    } finally {
      setSavingVersion(false);
    }
  };

  const handleIterateDraft = async (draft: AiDraftResult, customInstructions?: string) => {
    if (!sessionToken || !selectedId) {
      return;
    }

    const trimmedCustom = customInstructions?.trim() ?? '';
    const instructionPayload = trimmedCustom.length > 0
      ? trimmedCustom
      : iterationNotes.trim().length > 0
        ? iterationNotes.trim()
        : undefined;

    if (customInstructions !== undefined && trimmedCustom.length === 0) {
      setError('Add a quick vibe prompt before asking AI to edit this draft.');
      return;
    }

    setIteratingDraftId(draft.leadId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/iterate-drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          targets: [{
            leadId: draft.leadId,
            lastDraftText: draft.body,
            lastDraftHtml: draft.html ?? undefined
          }],
          instructions: instructionPayload,
          provider: aiProvider ?? defaultProviderRef.current,
          templateVersionId: draft.templateVersionId
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const iterations = (await response.json()) as AiDraftResult[];
      const updated = iterations[0];
      if (updated) {
        setAiDrafts((prev) =>
          prev
            ? prev.map((item) => (item.leadId === updated.leadId ? updated : item))
            : [updated]
        );
        setSuccess(`Refined the draft for ${updated.email}.`);
        if (customInstructions !== undefined) {
          setVibeNotes((prev) => {
            const next = { ...prev };
            delete next[draft.leadId];
            return next;
          });
        }
      }
    } catch (iterateError) {
      setError(iterateError instanceof Error ? iterateError.message : "Failed to iterate draft");
    } finally {
      setIteratingDraftId(null);
    }
  };

  const handleIterateDrafts = async (targets: AiDraftResult[]) => {
    if (!sessionToken || !selectedId || targets.length === 0) {
      return;
    }

    setBulkIterating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/iterate-drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          templateVersionId: activeVersion?.id ?? activeTemplateVersionId ?? undefined,
          instructions: iterationNotes.trim().length > 0 ? iterationNotes.trim() : undefined,
          provider: aiProvider ?? defaultProviderRef.current,
          targets: targets.map((draft) => ({
            leadId: draft.leadId,
            lastDraftHtml: draft.html ?? undefined,
            lastDraftText: draft.body
          }))
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const iterations = (await response.json()) as AiDraftResult[];
      setAiDrafts((prev) => {
        if (!prev) {
          return iterations;
        }
        const map = new Map(iterations.map((item) => [item.leadId, item]));
        return prev.map((item) => map.get(item.leadId) ?? item);
      });
      setSuccess(`Iterated ${iterations.length} draft${iterations.length === 1 ? '' : 's'} with AI.`);
    } catch (iterateError) {
      setError(iterateError instanceof Error ? iterateError.message : "Failed to iterate drafts");
    } finally {
      setBulkIterating(false);
    }
  };

  const handleApplyDesigner = useCallback((options?: { silent?: boolean }) => {
    const { html, text } = buildHtmlFromDesigner(designerState);
    if (!html || html.trim().length === 0) {
      setError("Add some copy to the designer before applying it.");
      return;
    }

    setHtmlDraft(html);
    setBody(text);
    if (!options?.silent) {
      setSuccess("Applied guided design. You can tweak the copy above or save it as a template version.");
    }
  }, [designerState]);

const resolveProvider = useCallback((): AiProvider | null => {
  if (aiProvider) {
    return aiProvider;
  }
  return defaultProviderRef.current;
}, [aiProvider]);

  useEffect(() => {
    if (!sessionToken || !hydrated) {
      return;
    }

    const payload: PersistedState = {
      version: 3,
      knowledgeBase,
      selectedId,
      selectedPresetId,
      templateDraft: {
        name,
        subject,
        body
      },
      aiProvider: aiProvider ?? undefined,
      aiDrafts: aiDrafts ?? undefined,
      selectedLeadIds: selectedLeadIds.length > 0 ? selectedLeadIds : undefined,
      leadSearch: leadSearch ? leadSearch : undefined,
      selectedConnectionId: selectedConnectionId ? selectedConnectionId : undefined,
      sentLog: sentLog.length > 0 ? sentLog.slice(0, 20) : undefined,
      htmlDraft,
      activeTemplateVersionId,
      designerState,
      designMode,
      strategyNotes: strategyNotes || undefined,
      htmlSuggestionNotes: htmlSuggestionNotes || undefined,
      chatHistory: chatHistory.length > 0 ? chatHistory.slice(-20) : undefined,
      enhancedPersonalization: enhancedPersonalization || undefined,
      allowToolUse: enhancedPersonalization ? allowToolUse : undefined,
      bulkSendEnabled: bulkSendEnabled || undefined
    };

    persistedRef.current = payload;

    try {
      window.localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(payload));
    } catch (storageError) {
      console.error('Failed to persist template state', storageError);
    }
  }, [
    hydrated,
    projectId,
    knowledgeBase,
    selectedId,
    name,
    subject,
    body,
    aiProvider,
    aiDrafts,
    selectedLeadIds,
    leadSearch,
    selectedConnectionId,
    sentLog,
    htmlDraft,
    activeTemplateVersionId,
    designerState,
    designMode,
    selectedPresetId,
    strategyNotes,
    htmlSuggestionNotes,
    chatHistory,
    enhancedPersonalization,
    allowToolUse,
    bulkSendEnabled
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  if (status === "loading" || !sessionToken) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-volta-stone-600">
        Loading templates…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/dashboard" className="inline-flex w-fit font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-primary hover:underline">
          ← Back to dashboard
        </Link>
        <span className="inline-flex w-fit border-2 border-volta-dark bg-volta-accent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark shadow-neo-sm">
          Campaign Studio
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight text-volta-dark">Templates &amp; Drafts</h1>
        <p className="text-sm text-volta-stone-700">
          Define the email subject and body using double curly braces for placeholders (e.g.
          <code className="mx-1 border border-volta-dark bg-volta-stone-100 px-1 font-mono text-xs">{'{{first_name}}'}</code>
          or <code className="mx-1 border border-volta-dark bg-volta-stone-100 px-1 font-mono text-xs">{'{{company|your company}}'}</code> for fallbacks).
          Preview the rendered copy on recent leads before sending.
        </p>
      </header>

      {error ? (
        <div className="border-2 border-volta-danger bg-volta-danger-soft px-4 py-3 text-sm text-volta-danger">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="border-2 border-volta-success bg-volta-success-soft px-4 py-3 text-sm text-volta-success">
          {success}
        </div>
      ) : null}

      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo-sm">
        <h2 className="text-lg font-medium text-volta-dark">Brand Knowledge Onboarding</h2>
        <p className="mt-1 text-sm text-volta-stone-600">
          Ground the AI with your narrative, then layer in supporting sources. The more context you add, the
          more bespoke your outreach becomes.
        </p>
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-volta-stone-500">Step 1 • Core narrative</h3>
            <textarea
              value={knowledgeBase}
              onChange={(event) => setKnowledgeBase(event.target.value)}
              rows={6}
              className="mt-3 w-full border-2 border-volta-dark px-3 py-2 text-sm font-mono focus:border-volta-dark focus:outline-none"
              placeholder="Summarize your brand story, tone, ideal customer profile, proof points, and objections you handle best."
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-volta-stone-500">Step 2 • Add supporting sources</h3>
            <p className="mt-1 text-sm text-volta-stone-600">Choose one or more options below. We append everything to your knowledge base so you can edit before saving.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div className="border-2 border-volta-dark p-4">
                <h4 className="text-base font-medium text-volta-dark">Scrape your website</h4>
                <p className="mt-1 text-sm text-volta-stone-600">Paste your homepage or product URL. We pull readable copy only.</p>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  placeholder="https://www.example.com"
                  className="mt-3 w-full border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleWebsiteScrape}
                  disabled={websiteLoading}
                  className="border-2 border-volta-dark shadow-neo mt-3 inline-flex items-center justify-center bg-volta-dark px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                >
                  {websiteLoading ? 'Pulling…' : 'Pull website copy'}
                </button>
                {websiteError ? <p className="mt-2 text-xs text-volta-danger">{websiteError}</p> : null}
              </div>
              <div className="border-2 border-volta-dark p-4">
                <h4 className="text-base font-medium text-volta-dark">Link a Google Doc</h4>
                <p className="mt-1 text-sm text-volta-stone-600">Share your pitch deck, scripting doc, or onboarding notes. Set the doc to viewable.</p>
                <input
                  type="url"
                  value={googleDocUrl}
                  onChange={(event) => setGoogleDocUrl(event.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="mt-3 w-full border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleGoogleDocImport}
                  disabled={googleDocLoading}
                  className="border-2 border-volta-dark shadow-neo mt-3 inline-flex items-center justify-center bg-volta-dark px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                >
                  {googleDocLoading ? 'Importing…' : 'Import Google Doc'}
                </button>
                {googleDocError ? <p className="mt-2 text-xs text-volta-danger">{googleDocError}</p> : null}
              </div>
              <div className="border-2 border-volta-dark p-4">
                <h4 className="text-base font-medium text-volta-dark">Upload documents</h4>
                <p className="mt-1 text-sm text-volta-stone-600">Drop playbooks, FAQs, or tone guides. You can upload multiple files at once.</p>
                <label className="mt-3 flex cursor-pointer items-center justify-center border-2 border-dashed border-volta-dark px-3 py-6 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50">
                  Select files
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.mdown,.pdf,.json"
                    multiple
                    onChange={handleKnowledgeFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="mt-2 text-xs text-volta-stone-500">Supported: Markdown, plain text, JSON, PDF (we extract readable text).</p>
                {knowledgeUploadInfo ? (
                  <p className="mt-1 text-xs text-volta-success">{knowledgeUploadInfo}</p>
                ) : null}
              </div>
            </div>
          </div>
          {knowledgeSources.length > 0 ? (
            <div className="border-2 border-volta-dark bg-volta-stone-50 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-volta-stone-500">
                Linked sources
              </h4>
              <p className="mt-1 text-xs text-volta-stone-600">
                We store summaries for quick drafting and keep the full text behind the scenes for deeper RAG use.
              </p>
              <ul className="mt-3 space-y-3 text-sm">
                {knowledgeSources
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((source) => (
                    <li key={source.id} className="border-2 border-volta-dark bg-volta-surface p-3">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-volta-stone-500">
                          {source.type === 'website'
                            ? 'Website'
                            : source.type === 'googleDoc'
                            ? 'Google Doc'
                            : 'Uploaded file'}
                        </span>
                        <span className="text-xs text-volta-stone-400">
                          Added {new Date(source.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-volta-dark">
                        {source.title ?? source.url ?? 'Untitled source'}
                      </p>
                      <p className="mt-1 text-xs text-volta-stone-600">
                        {source.summary}
                      </p>
                      <p className="mt-1 text-xs text-volta-stone-500">
                        {source.snippet}
                      </p>
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs font-medium text-volta-stone-500 underline"
                        >
                          Open source ↗
                        </a>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-volta-dark pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-volta-stone-500">Step 3 • Save &amp; continue</h3>
              <p className="text-sm text-volta-stone-600">Review the text above, make edits, then lock it in.</p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
              <button
                type="button"
                onClick={handleKnowledgeSave}
                disabled={knowledgeSaving}
                className="border-2 border-volta-dark shadow-neo inline-flex items-center justify-center bg-volta-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
              >
                {knowledgeSaving ? 'Saving…' : 'Save knowledge base'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteIntent((prev) => !prev);
                  setDeleteConfirmText('');
                }}
                className="inline-flex items-center justify-center border-2 border-volta-danger px-4 py-2 text-sm font-medium text-volta-danger hover:bg-volta-danger-soft"
              >
                Delete knowledge base
              </button>
            </div>
          </div>
          {deleteIntent ? (
            <div className="mt-3 border-2 border-volta-danger bg-volta-danger-soft p-4 text-sm text-volta-danger">
              <p>
                This will clear the summary and disconnect the linked sources from future drafting. Type
                <strong className="mx-1">{deletePhrase}</strong> to confirm.
              </p>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  className="flex-1 border-2 border-volta-danger px-3 py-2 text-sm focus:border-volta-danger focus:outline-none"
                  placeholder={deletePhrase}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!sessionToken) {
                      setError('Missing session. Please refresh and try again.');
                      return;
                    }
                    if (deleteConfirmText.trim() !== deletePhrase) {
                      setError('Confirmation phrase does not match.');
                      return;
                    }
                    try {
                      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/knowledge-base`, {
                        method: 'DELETE',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-session-token': sessionToken ?? ''
                        },
                        body: JSON.stringify({ confirmation: deletePhrase })
                      });
                      if (!response.ok) {
                        throw new Error(await extractErrorMessage(response));
                      }
                      const data = (await response.json()) as {
                        knowledgeBase?: string;
                        sources?: KnowledgeSource[];
                      };
                      setKnowledgeBase(data.knowledgeBase ?? '');
                      setKnowledgeSources(Array.isArray(data.sources) ? data.sources : []);
                      setSuccess('Knowledge base cleared.');
                      setDeleteIntent(false);
                      setDeleteConfirmText('');
                    } catch (deleteError) {
                      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete knowledge base.');
                    }
                  }}
                  className="border-2 border-volta-dark shadow-neo inline-flex items-center justify-center bg-volta-danger px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                >
                  Confirm deletion
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo-sm">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <h2 className="text-lg font-medium text-volta-dark">Sender Settings</h2>
            <p className="mt-1 text-sm text-volta-stone-600">
              Choose the Gmail account that will send approved drafts.
            </p>
            {gmailConnections.length === 0 ? (
              <p className="mt-3 text-sm text-volta-stone-600">
                No Gmail accounts connected yet. Connect one to unlock sending.
              </p>
            ) : (
              <label className="mt-3 flex flex-col gap-1 text-sm text-volta-stone-700">
                Active Gmail connection
                <select
                  value={connectionSelectValue}
                  onChange={(event) => setSelectedConnectionId(event.target.value)}
                  className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                >
                  {gmailConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.email}
                      {connection.needsReauth ?" (needs reconnect)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <a
              href={`/integrations/gmail/connect?projectId=${projectId}`}
              className="mt-3 inline-flex items-center text-sm font-medium text-volta-stone-700 hover:text-volta-dark"
            >
              Connect another account →
            </a>
            {gmailConnections.length > 0 && activeConnection?.needsReauth ? (
              <div className="mt-3 border-2 border-volta-warn bg-volta-warn-soft px-3 py-2 text-sm text-volta-warn">
                Gmail access for <span className="font-medium">{activeConnection.email}</span> has expired.
                Reconnect the account above to refresh permissions before sending emails.
              </div>
            ) : null}
            {gmailConnections.length > 0 && activeConnection?.lastError && !activeConnection.needsReauth ? (
              <div className="mt-3 border-2 border-volta-dark bg-volta-stone-50 px-3 py-2 text-sm text-volta-stone-700">
                Last Gmail response: {activeConnection.lastError}
                {activeConnection.lastErrorAt ? ` (${new Date(activeConnection.lastErrorAt).toLocaleString()})` : ""}
              </div>
            ) : null}
          </div>
          <div>
            <h2 className="text-lg font-medium text-volta-dark">Lead Queue</h2>
            <p className="mt-1 text-sm text-volta-stone-600">
              Select the leads you want the AI to prioritize when generating drafts.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={leadSearch}
                onChange={(event) => setLeadSearch(event.target.value)}
                placeholder="Search by email, name, or company"
                className="w-full min-w-[220px] flex-1 border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={filteredLeads.length === 0}
                className="border-2 border-volta-dark px-3 py-1.5 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={clearSelectedLeads}
                disabled={selectedLeadCount === 0}
                className="border-2 border-volta-dark px-3 py-1.5 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => loadLeads()}
                className="border-2 border-volta-dark px-3 py-1.5 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
                disabled={loadingLeads}
              >
                {loadingLeads ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="mt-2 text-xs text-volta-stone-500">
              {selectedLeadCount} selected • {leadOptions.length} loaded • showing {filteredLeads.length} matching
            </p>
            {leadLoadError ? (
              <div className="mt-2 border-2 border-volta-danger bg-volta-danger-soft px-3 py-2 text-xs text-volta-danger">
                {leadLoadError}
              </div>
            ) : null}
            <div className="mt-3 max-h-64 overflow-y-auto border-2 border-volta-dark">
              {loadingLeads ? (
                <p className="px-3 py-3 text-sm text-volta-stone-600">Loading latest leads…</p>
              ) : filteredLeads.length === 0 ? (
                <p className="px-3 py-3 text-sm text-volta-stone-600">No leads match the current filter.</p>
              ) : (
                <ul className="divide-y divide-slate-200 text-sm">
                  {filteredLeads.map((lead) => {
                    const checked = selectedLeadIds.includes(lead.id);
                    return (
                      <li key={lead.id} className="bg-volta-surface">
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-3 hover:bg-volta-stone-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLeadSelection(lead.id)}
                            className="mt-1 size-4 border-volta-dark"
                          />
                          <div>
                            <p className="font-medium text-volta-dark">{lead.email}</p>
                            <p className="text-xs text-volta-stone-500">
                              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                              {lead.company ? ` • ${lead.company}` : ""}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-volta-dark">AI Template Studio</h2>
            <p className="mt-1 text-sm text-volta-stone-600">
              Combine copy and design in one place. Let AI refresh both and it will immediately update the active HTML version used for drafts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setName("New template");
              setSubject("Hi {{first_name|there}}");
              setBody("{{first_name|there}},\n\nI'm reaching out because {{company}} looks like a great fit for us.");
              setAiDrafts(null);
              setHtmlDraft('');
              setActiveTemplateVersionId(null);
              setDesignerState(defaultDesignerState);
              setDesignMode('builder');
            }}
            className="border-2 border-volta-dark shadow-neo bg-volta-dark px-3 py-1.5 text-sm font-medium text-white transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
          >
            New template
          </button>
        </div>
        <div className="mt-4 border-2 border-dashed border-volta-dark bg-volta-stone-50 p-4 text-sm text-volta-stone-600">
          Template Studio is coming soon. We&apos;ll add visual presets and layout controls here once they&apos;re ready.
        </div>
        {false && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-volta-stone-400">Curated presets</p>
              <p className="text-sm text-volta-stone-600">Pick a starting point, then let AI strategically edit it.</p>
            </div>
            {selectedPreset ? (
              <button
                type="button"
                onClick={() => setSelectedPresetId(null)}
                className="text-xs font-medium text-volta-stone-500 hover:text-volta-stone-700"
              >
                Clear preset
              </button>
            ) : null}
          </div>
          {presetError ? (
            <div className="border-2 border-volta-warn bg-volta-warn-soft px-3 py-2 text-xs text-volta-warn">
              {presetError}
            </div>
          ) : null}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {presetLoading && templatePresets.length === 0 ? (
              <div className="flex min-w-[280px] items-center justify-center border-2 border-volta-dark bg-volta-stone-50 p-6 text-xs text-volta-stone-500">
                Loading presets…
              </div>
            ) : null}
            {templatePresets.map((preset) => {
              const active = selectedPresetId === preset.id;
              return (
                <article
                  key={preset.id}
                  className={`min-w-[280px] max-w-[320px] flex-1  border ${
                    active ? 'border-volta-success bg-volta-success-soft/70' : 'border-volta-dark bg-volta-surface'
                  } shadow-neo-sm transition`}
                >
                  <div className="flex flex-col gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-volta-dark">{preset.name}</p>
                      <p className="text-xs text-volta-stone-500">{preset.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-volta-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-volta-stone-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="overflow-hidden border-2 border-volta-dark">
                      <iframe title={preset.name} srcDoc={preset.html} className="h-36 w-full" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="border-2 border-volta-dark px-3 py-1 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50"
                      >
                        Load preset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleApplyPreset(preset);
                          void handleGenerateAiTemplateBundle();
                        }}
                        disabled={suggestingTemplate}
                        className="border-2 border-volta-dark shadow-neo bg-volta-success px-3 py-1 text-xs font-semibold text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                      >
                        {suggestingTemplate && active ? 'Refining…' : 'AI refine'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-2 border-volta-dark bg-volta-stone-50 p-3 text-sm">
            {templates.length === 0 ? (
              <p className="text-volta-stone-600">No templates yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-2">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(template.id);
                        setName(template.name);
                        setSubject(template.subject);
                        setBody(template.activeVersion?.textContent ?? template.body);
                        setAiDrafts(null);
                        setHtmlDraft(template.activeVersion?.htmlContent ?? '');
                        setActiveTemplateVersionId(template.activeVersion?.id ?? null);
                        setDesignerState(defaultDesignerState);
                        setDesignMode(template.activeVersion?.htmlContent ? 'html' : 'builder');
                      }}
                      className={`w-full  px-2 py-1 text-left ${
                        selectedId === template.id
                          ? "bg-volta-dark text-white"
                          : "bg-volta-surface text-volta-stone-700 hover:bg-volta-stone-100"
                      }`}
                    >
                      {template.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-volta-stone-700">Template name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-volta-stone-700">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-volta-stone-700">
                Body (uses placeholders like {'{{first_name}}'})
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className="border-2 border-volta-dark px-3 py-2 font-mono text-xs focus:border-volta-dark focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-volta-stone-700">AI strategy notes (optional)</span>
              <textarea
                value={strategyNotes}
                onChange={(event) => setStrategyNotes(event.target.value)}
                rows={3}
                className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                placeholder="Tell the AI how to adjust tone, highlight a benefit, address an objection, or tweak the CTA."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="border-2 border-volta-dark shadow-neo bg-volta-dark px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
              >
                {saving ? "Saving…" : "Save copy"}
              </button>
              <button
                type="button"
                onClick={handleDeleteTemplate}
                disabled={!selectedId || deletingTemplate}
                className="border-2 border-volta-danger px-3 py-1.5 text-sm font-medium text-volta-danger hover:bg-volta-danger-soft disabled:opacity-60"
              >
                {deletingTemplate ? "Deleting…" : "Delete template"}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAiTemplateBundle()}
                disabled={suggestingTemplate}
                className="border-2 border-volta-dark shadow-neo bg-volta-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
              >
                {suggestingTemplate ? "Asking AI…" : "Ask AI to draft copy"}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateDrafts(selectedLeadIds.length > 0 ? selectedLeadIds : undefined)}
                disabled={generatingAi || selectedLeadIds.length === 0}
                className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
              >
                {generatingAi
                  ? "Generating drafts…"
                  : `Generate drafts (${selectedLeadIds.length || 0} selected)`}
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50"
              >
                Chat with AI
              </button>
            </div>
            <div className="border-2 border-dashed border-volta-dark bg-volta-stone-50 p-4 text-sm text-volta-stone-600">
              Template Studio layout tools are coming soon. We&apos;ll surface design controls here once they&apos;re ready.
            </div>
            {false && (
              <>
                <div className="border-2 border-volta-dark bg-volta-stone-50 p-4 space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-volta-stone-700">Layout & visuals</h3>
                      <p className="text-xs text-volta-stone-500">
                        AI keeps the HTML version in sync with your copy. Switch modes below for quick tweaks or full control.
                      </p>
                      {activeVersion ? (
                        <p className="text-xs text-volta-stone-500">
                          Active:{' '}
                          <span className="font-semibold text-volta-stone-700">
                            {activeVersionTitle}
                          </span>{' '}
                          • Source: {activeVersionSourceLabel} • Updated {activeVersionUpdatedLabel}
                        </p>
                      ) : (
                        <p className="text-xs text-volta-warn">
                          No active HTML version yet. Generate with AI or save a layout to activate one.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveActiveVersion}
                        disabled={savingVersion}
                        className="border-2 border-volta-dark shadow-neo bg-volta-dark px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                      >
                        {savingVersion ? "Saving…" : activeVersion ? "Save layout" : "Save & activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateNewVersion(true)}
                        disabled={savingVersion}
                        className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
                      >
                        {savingVersion ? "Saving…" : "Save as new active version"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-volta-stone-700">Mode</span>
                    <button
                      type="button"
                      onClick={() => setDesignMode('builder')}
                      className={` px-3 py-1.5 text-sm font-medium ${
                        designMode === 'builder'
                          ? 'bg-volta-dark text-white'
                          : 'border border-volta-dark text-volta-stone-700 hover:bg-volta-stone-50'
                      }`}
                    >
                      Guided builder
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesignMode('html')}
                      className={` px-3 py-1.5 text-sm font-medium ${
                        designMode === 'html'
                          ? 'bg-volta-dark text-white'
                          : 'border border-volta-dark text-volta-stone-700 hover:bg-volta-stone-50'
                      }`}
                    >
                      Raw HTML editor
                    </button>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
                    <div className="space-y-4">
                      {designMode === 'builder' ? (
                        <>
                          <TemplateDesigner value={designerState} onChange={setDesignerState} onPreview={handleDesignerPreview} />
                          <button
                            type="button"
                            onClick={() => handleApplyDesigner()}
                            className="border-2 border-volta-dark shadow-neo bg-volta-success px-3 py-1.5 text-sm font-medium text-white transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                          >
                            Apply design to HTML editor
                          </button>
                        </>
                      ) : (
                        <label className="flex flex-col gap-2 text-sm text-volta-stone-700">
                          <span className="font-medium">HTML template</span>
                          <textarea
                            value={htmlDraft}
                            onChange={(event) => setHtmlDraft(event.target.value)}
                            rows={20}
                            className="h-[360px] w-full border-2 border-volta-dark px-3 py-2 font-mono text-xs focus:border-volta-dark focus:outline-none"
                            placeholder="Paste or design your HTML template here"
                          />
                        </label>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="flex flex-col gap-2 text-sm text-volta-stone-700">
                        <span className="font-medium">AI design brief (optional)</span>
                        <textarea
                          value={htmlSuggestionNotes}
                          onChange={(event) => setHtmlSuggestionNotes(event.target.value)}
                          rows={4}
                          className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                          placeholder="Describe colors, layout, tone, or goals for AI-generated templates"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleGenerateAiTemplateBundle({ designOnly: true })}
                        disabled={suggestingTemplate}
                        className="inline-flex items-center justify-center border-2 border-volta-success px-3 py-1.5 text-sm font-medium text-volta-success hover:bg-volta-success-soft disabled:opacity-60"
                      >
                        {suggestingTemplate ? "Refreshing designs…" : "Refresh layout with AI"}
                      </button>
                      <p className="text-xs text-volta-stone-500">
                        Reuse the latest copy but ask AI to rethink the visual treatment. We keep your current HTML in case you want to undo.
                      </p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-volta-stone-700">Live preview</h4>
                    <div className="mt-2 overflow-hidden border-2 border-volta-dark bg-volta-surface shadow-neo-sm">
                      <iframe
                        title="Template preview"
                        srcDoc={
                          designMode === 'builder'
                            ? builderPreviewHtml
                            : htmlDraft || `<div style="font-family: Arial, sans-serif; padding: 16px; color: #475569;">No HTML template yet. Add markup to preview it here.</div>`
                        }
                        className="h-[360px] w-full"
                      />
                    </div>
                    {designMode === 'builder' ? (
                      <details className="mt-3 border-2 border-volta-dark bg-volta-stone-50 px-3 py-2 text-xs text-volta-stone-600">
                        <summary className="cursor-pointer select-none font-semibold text-volta-stone-700">
                          Plain text preview
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-volta-stone-600">
                          {builderPreviewText}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
                {htmlSuggestions?.length ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-medium text-volta-stone-700">Alternate AI layouts</h3>
                      <button
                        type="button"
                        onClick={() => setHtmlSuggestions(undefined)}
                        className="text-xs font-medium text-volta-stone-500 hover:text-volta-stone-700"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {(htmlSuggestions ?? []).map((suggestion) => (
                        <div key={suggestion.id} className="flex flex-col gap-3 border-2 border-volta-dark p-3 shadow-neo-sm">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-volta-dark">{suggestion.title}</p>
                              {suggestion.description ? (
                                <p className="text-xs text-volta-stone-500">{suggestion.description}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAdoptHtmlSuggestion(suggestion)}
                              className="border-2 border-volta-dark shadow-neo bg-volta-success px-2 py-1 text-xs font-semibold text-white transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                            >
                              Adopt
                            </button>
                          </div>
                          <div className="overflow-hidden border-2 border-volta-dark">
                            <iframe
                              title={suggestion.title}
                              srcDoc={suggestion.htmlContent ?? ''}
                              className="h-48 w-full"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setHtmlDraft(suggestion.htmlContent ?? '');
                                if (suggestion.textContent) {
                                  setBody(suggestion.textContent);
                                }
                              }}
                              className="border-2 border-volta-dark px-3 py-1 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50"
                            >
                              Load into editor
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {selectedTemplate?.versions && selectedTemplate.versions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-volta-stone-700">Version history</h3>
                <div className="space-y-2">
                  {selectedTemplate.versions.map((version) => (
                    <div
                      key={version.id}
                      className={`flex flex-col gap-2  border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between ${
                        version.isActive ? 'border-volta-success bg-volta-success-soft' : 'border-volta-dark bg-volta-stone-50'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-volta-dark">
                          {version.title}
                          {version.isActive ? ' (active)' : ''}
                        </p>
                        <p className="text-xs text-volta-stone-500">
                          Source: {version.source === 'AI' ? 'AI' : 'Human'} • Updated {new Date(version.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadVersionIntoEditor(version)}
                          className="border-2 border-volta-dark px-3 py-1 text-xs font-medium text-volta-stone-700 hover:bg-volta-stone-50"
                        >
                          Edit
                        </button>
                        {!version.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleActivateVersion(version.id)}
                            className="border-2 border-volta-dark shadow-neo bg-volta-success px-3 py-1 text-xs font-medium text-white transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                          >
                            Activate
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {aiDrafts ? (
        <section className="border-2 border-volta-success bg-volta-surface p-6 shadow-neo-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-volta-dark">Drafts — {aiDrafts.length} total</h2>
              <p className="mt-1 text-sm text-volta-stone-600">
                Personalized emails generated from your template.{" "}
                {activeConnection
                  ? `Approvals will send immediately from ${activeConnection.email}.`
                  : "Connect Gmail to approve and send without copying manually."}
              </p>
              <label className="mt-2 flex items-start gap-2 text-xs text-volta-stone-500">
                <input
                  type="checkbox"
                  checked={bulkSendEnabled}
                  onChange={(event) => setBulkSendEnabled(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 border-volta-dark text-volta-dark focus:ring-2 focus:ring-slate-500/20"
                />
                <span>
                  Enable one-click send for all ready drafts. Review copy first—this uses the selected Gmail connection immediately.
                </span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiDrafts(null);
                  setCurrentDraftPage(1);
                  setSuccess('All drafts cleared');
                }}
                className="inline-flex items-center justify-center border-2 border-volta-dark bg-volta-surface px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50"
              >
                Clear all drafts
              </button>
            <button
              type="button"
              onClick={handleApproveAllDrafts}
              disabled={
                bulkSending ||
                !aiDrafts ||
                aiDrafts.length === 0 ||
                !bulkSendEnabled ||
                !activeConnection ||
                activeConnection.needsReauth === true
              }
              className="border-2 border-volta-dark shadow-neo inline-flex items-center justify-center bg-volta-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
            >
              {bulkSending
                ? "Sending drafts…"
                : !activeConnection
                  ? "Connect Gmail"
                  : activeConnection.needsReauth
                    ? "Reconnect Gmail"
                    : "Approve & send all"}
            </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
            <label className="flex flex-col gap-2 text-sm text-volta-stone-700">
              <span className="font-medium">Iteration guidance</span>
              <textarea
                value={iterationNotes}
                onChange={(event) => setIterationNotes(event.target.value)}
                rows={3}
                className="border-2 border-volta-dark px-3 py-2 text-sm focus:border-volta-dark focus:outline-none"
                placeholder="Optional notes for AI when improving drafts (tone tweaks, new CTA, etc.)"
              />
            </label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleIterateDrafts(aiDrafts ?? [])}
                disabled={bulkIterating || !aiDrafts || aiDrafts.length === 0}
                className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
              >
                {bulkIterating ? 'Iterating…' : 'Iterate all drafts'}
              </button>
              <button
                type="button"
                onClick={() => handleIterateDrafts((aiDrafts ?? []).filter((draft) => selectedLeadIds.includes(draft.leadId)))}
                disabled={
                  bulkIterating ||
                  !aiDrafts ||
                  aiDrafts.filter((draft) => selectedLeadIds.includes(draft.leadId)).length === 0
                }
                className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-60"
              >
                {bulkIterating ? 'Iterating…' : 'Iterate selected leads'}
              </button>
            </div>
          </div>
          
          {/* Pagination Controls */}
          {aiDrafts.length > draftsPerPage && (
            <div className="mt-4 flex items-center justify-between border-t border-volta-dark pt-4">
              <p className="text-sm text-volta-stone-600">
                Showing {((currentDraftPage - 1) * draftsPerPage) + 1} to {Math.min(currentDraftPage * draftsPerPage, aiDrafts.length)} of {aiDrafts.length} drafts
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentDraftPage(p => Math.max(1, p - 1))}
                  disabled={currentDraftPage === 1}
                  className="border-2 border-volta-dark px-3 py-1 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: Math.ceil(aiDrafts.length / draftsPerPage) }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentDraftPage(pageNum)}
                    className={` px-3 py-1 text-sm font-medium ${
                      currentDraftPage === pageNum
                        ? 'bg-volta-success text-white'
                        : 'border border-volta-dark text-volta-stone-700 hover:bg-volta-stone-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentDraftPage(p => Math.min(Math.ceil(aiDrafts.length / draftsPerPage), p + 1))}
                  disabled={currentDraftPage === Math.ceil(aiDrafts.length / draftsPerPage)}
                  className="border-2 border-volta-dark px-3 py-1 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          <div className="mt-4 space-y-4">
            {aiDrafts
              .slice((currentDraftPage - 1) * draftsPerPage, currentDraftPage * draftsPerPage)
              .map((draft) => (
              <article key={draft.leadId} className="border-2 border-volta-dark bg-volta-stone-50 p-4">
                <header className="flex items-center justify-between text-sm text-volta-stone-600">
                  <span>{draft.email}</span>
                  <span className="bg-volta-success-soft px-2 py-0.5 text-xs font-semibold uppercase text-volta-success">
                    AI generated
                  </span>
                </header>
                {draft.notes ? (
                  <p className="mt-2 text-xs text-volta-stone-500">
                    {draft.notes}
                  </p>
                ) : null}
                <h3 className="mt-2 text-base font-semibold text-volta-dark">{draft.subject}</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                  <p className="whitespace-pre-wrap text-sm text-volta-stone-700">{draft.body}</p>
                  <div>
                    <div className="overflow-hidden border-2 border-volta-dark bg-volta-surface shadow-neo-sm">
                      <iframe
                        title={`Preview ${draft.email}`}
                        srcDoc={draft.html ?? `<div style="font-family: Arial, sans-serif; padding: 16px;">${draft.body.replace(/\n/g, '<br />')}</div>`}
                        className="h-48 w-full"
                      />
                    </div>
                  </div>
                </div>
                <label className="mt-3 flex flex-col gap-1 text-xs text-volta-stone-600">
                  <span className="font-medium text-volta-stone-700">Vibe prompt (optional)</span>
                  <textarea
                    value={vibeNotes[draft.leadId] ?? ''}
                    onChange={(event) =>
                      setVibeNotes((prev) => ({ ...prev, [draft.leadId]: event.target.value }))
                    }
                    rows={2}
                    className="border-2 border-volta-dark px-3 py-1.5 text-xs focus:border-volta-dark focus:outline-none"
                    placeholder="e.g., make it more playful, highlight the pilot timeline, or add social proof"
                  />
                </label>
                <footer className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveDraft(draft)}
                    disabled={
                      sendingDraftId === draft.leadId ||
                      !activeConnection ||
                      activeConnection.needsReauth === true
                    }
                    className="border-2 border-volta-dark shadow-neo bg-volta-success px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm"
                  >
                    {sendingDraftId === draft.leadId
                      ? "Sending…"
                      : !activeConnection
                        ? "Connect Gmail"
                        : activeConnection.needsReauth
                          ? "Reconnect Gmail"
                          : "Approve & send"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIterateDraft(draft, vibeNotes[draft.leadId] ?? '')}
                    disabled={
                      iteratingDraftId === draft.leadId ||
                      bulkIterating ||
                      !(vibeNotes[draft.leadId]?.trim())
                    }
                    className="border-2 border-volta-success px-3 py-1.5 text-sm font-medium text-volta-success hover:bg-volta-success-soft disabled:opacity-60"
                  >
                    {iteratingDraftId === draft.leadId ? 'Vibing…' : 'Vibe edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIterateDraft(draft)}
                    disabled={iteratingDraftId === draft.leadId || bulkIterating}
                    className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-100 disabled:opacity-60"
                  >
                    {iteratingDraftId === draft.leadId ? 'Iterating…' : 'Quick improve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerateDraft(draft.leadId)}
                    disabled={generatingAi}
                    className="border-2 border-volta-dark px-3 py-1.5 text-sm font-medium text-volta-stone-700 hover:bg-volta-stone-100 disabled:opacity-60"
                  >
                    {generatingAi ? "Regenerating…" : "Regenerate"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sentLog.length > 0 ? (
        <section className="border-2 border-volta-dark bg-volta-surface p-6 shadow-neo-sm">
          <h2 className="text-lg font-medium text-volta-dark">Recently Sent</h2>
          <p className="mt-1 text-sm text-volta-stone-600">
            Approvals you&apos;ve completed in this session. Track which Gmail account handled each send.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-volta-stone-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-volta-stone-700">Recipient</th>
                  <th className="px-3 py-2 text-left font-semibold text-volta-stone-700">Subject</th>
                  <th className="px-3 py-2 text-left font-semibold text-volta-stone-700">Sent at</th>
                  <th className="px-3 py-2 text-left font-semibold text-volta-stone-700">Gmail connection</th>
                </tr>
              </thead>
              <tbody>
                {sentLog.map((entry) => (
                  <tr key={entry.messageId} className="odd:bg-volta-surface even:bg-volta-stone-50">
                    <td className="px-3 py-2 text-volta-stone-700">{entry.email}</td>
                    <td className="px-3 py-2 text-volta-stone-700">{entry.subject}</td>
                    <td className="px-3 py-2 text-volta-stone-600">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-volta-stone-600">{entry.gmailConnectionEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <TemplateChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatHistory}
        onSend={handleChatSend}
        isSending={chatLoading}
        error={chatError}
        onApplyUpdate={handleApplyChatUpdates}
      />
    </main>
  );
}
