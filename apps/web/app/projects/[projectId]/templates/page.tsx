"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  AiDraftResult,
  RenderedLeadPreview,
  TemplateSummary,
  GmailConnectionSummary,
  LeadSummary,
  SendDraftResponse,
  AiTemplateSuggestion,
  BulkSendResponse,
  TemplateVersionSummary,
  KnowledgeSource,
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
  aiProvider?: "openrouter" | "openai" | "gemini";
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
  const [preview, setPreview] = useState<RenderedLeadPreview[] | null>(null);
  const [aiDrafts, setAiDrafts] = useState<AiDraftResult[] | null>(null);
  const [aiProvider, setAiProvider] = useState<'openrouter' | 'openai' | 'gemini'>('openrouter');
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
  const [previewSending, setPreviewSending] = useState(false);
  const [previewSendingId, setPreviewSendingId] = useState<string | null>(null);
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
    setPreview(null);
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
    setPreview(null);
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
        if (parsed.aiProvider) {
          setAiProvider(parsed.aiProvider);
        }
        if (parsed.aiDrafts) {
          setAiDrafts(parsed.aiDrafts);
        }
        if (parsed.selectedLeadIds) {
          setSelectedLeadIds(parsed.selectedLeadIds);
        }
        if (parsed.leadSearch) {
          setLeadSearch(parsed.leadSearch);
        }
        if (parsed.selectedConnectionId) {
          setSelectedConnectionId(parsed.selectedConnectionId);
        }
        if (parsed.sentLog) {
          setSentLog(parsed.sentLog);
        }
        if (parsed.htmlDraft !== undefined) {
          setHtmlDraft(parsed.htmlDraft);
        }
        if (parsed.activeTemplateVersionId !== undefined) {
          setActiveTemplateVersionId(parsed.activeTemplateVersionId ?? null);
        }
        if (parsed.designerState) {
          setDesignerState({ ...defaultDesignerState, ...parsed.designerState });
        }
        if (parsed.designMode) {
          setDesignMode(parsed.designMode);
        }
        if (parsed.strategyNotes !== undefined) {
          setStrategyNotes(parsed.strategyNotes);
        }
        if (parsed.htmlSuggestionNotes !== undefined) {
          setHtmlSuggestionNotes(parsed.htmlSuggestionNotes);
        }
        if (parsed.chatHistory) {
          setChatHistory(parsed.chatHistory);
        }
        if (typeof parsed.enhancedPersonalization === "boolean") {
          setEnhancedPersonalization(parsed.enhancedPersonalization);
        }
        if (typeof parsed.allowToolUse === "boolean") {
          setAllowToolUse(parsed.allowToolUse);
        }
        if (typeof parsed.bulkSendEnabled === "boolean") {
          setBulkSendEnabled(parsed.bulkSendEnabled);
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
      aiProvider,
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
  const hasPreview = Array.isArray(preview) && preview.length > 0;

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

  const handlePreview = async (sampleSize = 5) => {
    if (!selectedId) {
      const created = await handleCreate();
      if (!created) {
        return;
      }
      setSelectedId(created.id);
    }

    setError(null);
    setPreview(null);
    setAiDrafts(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
            "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({ sampleSize })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const data = (await response.json()) as RenderedLeadPreview[];
      const normalized = data.map((row) => ({
        ...row,
        subject: row.subject.replace(/\\n/g, '\n'),
        body: row.body.replace(/\\n/g, '\n')
      }));
      setPreview(normalized);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to render preview");
    }
  };

  const handleGenerateAi = async (sampleSize = 3, leadIds?: string[]) => {
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

    if ((!leadIds || leadIds.length === 0) && leadOptions.length === 0) {
      setError('Import leads before generating drafts.');
      return;
    }

    setError(null);
    setSuccess(null);
    setGeneratingAi(true);

    const effectiveLeadIds =
      leadIds ?? (selectedLeadIds.length > 0 ? selectedLeadIds : undefined);

    if (!effectiveLeadIds || effectiveLeadIds.length !== 1) {
      setAiDrafts(null);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000); // 28 second timeout (Heroku 30s limit - 2s buffer)

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/generate`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken ?? ""
        },
        body: JSON.stringify({
          sampleSize,
          provider: aiProvider,
          leadIds: effectiveLeadIds,
          enhancedPersonalization: enhancedPersonalization || undefined,
          allowToolUse: enhancedPersonalization ? allowToolUse : undefined
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const data = (await response.json()) as AiDraftResult[];
      const enriched = data.map((draft) => ({
        ...draft,
        subject: draft.subject.replace(/\\n/g, '\n'),
        body: draft.body.replace(/\\n/g, '\n'),
        html: typeof draft.html === 'string' ? draft.html : draft.html,
        templateVersionId: draft.templateVersionId ?? activeVersion?.id ?? activeTemplateVersionId ?? undefined
      }));

      if (effectiveLeadIds && effectiveLeadIds.length === 1) {
        setAiDrafts((prev) => {
          const replacement = enriched[0];
          if (!replacement) {
            return prev ?? null;
          }
          if (!prev) {
            return enriched;
          }
          return prev.map((draft) =>
            draft.leadId === effectiveLeadIds[0] ? replacement : draft
          );
        });
      } else {
        setAiDrafts(enriched);
      }

      let baseMessage: string;
      if (effectiveLeadIds && effectiveLeadIds.length === 1 && data[0]) {
        baseMessage = `Generated draft for ${data[0].email}`;
      } else if (effectiveLeadIds && effectiveLeadIds.length > 1) {
        baseMessage = `Generated ${data.length} drafts for selected leads.`;
      } else {
        baseMessage = `Generated ${data.length} drafts from recent leads.`;
      }

      if (enhancedPersonalization) {
        baseMessage = `${baseMessage} Personalization boost enabled${allowToolUse ? ' with research assistance.' : '.'}`;
      }

      setSuccess(baseMessage);
    } catch (aiError) {
      let errorMessage = "Failed to generate AI drafts";
      if (aiError instanceof Error) {
        if (aiError.name === 'AbortError') {
          errorMessage = "AI generation timed out. The AI provider took too long. Try reducing the number of leads or switching to a different AI provider.";
        } else {
          errorMessage = aiError.message;
        }
      }
      setError(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setGeneratingAi(false);
    }
  };

  const handleRegenerateDraft = async (leadId: string) => {
    await handleGenerateAi(1, [leadId]);
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
              provider: aiProvider,
              knowledgeBase: knowledgeBase.trim().length > 0 ? knowledgeBase : undefined,
              instructions: strategyNotes.trim().length > 0 ? strategyNotes.trim() : undefined
            }).filter(([, value]) => value !== undefined)
          )
        )
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
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

  const handleSendPreview = async () => {
    if (!bulkSendEnabled) {
      return;
    }

    if (!selectedId || !preview || preview.length === 0) {
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

    setPreviewSending(true);
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
          drafts: preview.map((row) => ({
            leadId: row.leadId,
            subject: row.subject,
            body: row.body,
            html: `<div style="font-family: Arial, sans-serif; padding: 16px;">${row.body.replace(/\n/g, '<br />')}</div>`,
            templateVersionId: activeVersion?.id ?? activeTemplateVersionId ?? undefined
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
        setSentLog((prev) => [
          ...sentLeads.map((item) => {
            const row = preview.find((d) => d.leadId === item.leadId);
            return {
              leadId: item.leadId,
              email: row?.email ?? item.leadId,
              subject: row?.subject ?? '',
              messageId: item.messageId ?? '',
              sentAt: item.sentAt ?? new Date().toISOString(),
              gmailConnectionEmail: item.gmailConnectionEmail ?? (activeConnection?.email ?? '')
            };
          }),
          ...prev
        ]);
        setSuccess(`Sent ${sentLeads.length} preview email${sentLeads.length === 1 ? '' : 's'} successfully.`);
      }

      if (failed.length > 0) {
        const failedDetails = failed
          .map((item) => {
            const row = preview.find((d) => d.leadId === item.leadId);
            const label = row ? row.email : item.leadId;
            const reason = item.error ?? 'Unknown error';
            return `${label} (${reason})`;
          })
          .join('; ');
        setError(`Failed to send ${failed.length} preview email${failed.length === 1 ? '' : 's'}. ${failedDetails}`);
      } else {
        setError(null);
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send preview emails';
      setError(message);
      await refreshConnections();
    } finally {
      setPreviewSending(false);
    }
  };

  const handleSendPreviewRow = async (row: RenderedLeadPreview) => {
    if (!bulkSendEnabled) {
      setError('Enable bulk send to dispatch emails from preview.');
      return;
    }

    if (!selectedId) {
      setError('Save your template before sending emails.');
      return;
    }

    if (!activeConnection) {
      setError('Connect a Gmail account before sending emails.');
      return;
    }

    if (activeConnection.needsReauth) {
      setError('Reconnect your Gmail account to refresh access before sending emails.');
      return;
    }

    setPreviewSendingId(row.leadId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/templates/${selectedId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken ?? ''
        },
        body: JSON.stringify({
          leadId: row.leadId,
          subject: row.subject,
          body: row.body,
          html: row.body ? `<div style="font-family: Arial, sans-serif; padding: 16px;">${row.body.replace(/\n/g, '<br />')}</div>` : undefined,
          templateVersionId: activeVersion?.id ?? activeTemplateVersionId ?? undefined,
          gmailConnectionId: selectedConnectionId || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }

      const result = (await response.json()) as SendDraftResponse;
      setSentLog((prev) => [
        {
          leadId: row.leadId,
          email: row.email,
          subject: row.subject,
          messageId: result.messageId,
          sentAt: result.sentAt,
          gmailConnectionEmail: result.gmailConnectionEmail
        },
        ...prev
      ]);
      setSelectedLeadIds((prev) => prev.filter((id) => id !== row.leadId));
      setSuccess(`Sent email to ${row.email}`);
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Failed to send preview email';
      setError(message);
      await refreshConnections();
    } finally {
      setPreviewSendingId(null);
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
          templateVersionId: draft.templateVersionId ?? activeVersion?.id ?? activeTemplateVersionId ?? undefined,
          instructions: instructionPayload,
          provider: aiProvider,
          targets: [
            {
              leadId: draft.leadId,
              lastDraftHtml: draft.html ?? undefined,
              lastDraftText: draft.body
            }
          ]
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
          "x-session-token": sessionToken
        },
        body: JSON.stringify({
          templateVersionId: activeVersion?.id ?? activeTemplateVersionId ?? undefined,
          instructions: iterationNotes.trim().length > 0 ? iterationNotes.trim() : undefined,
          provider: aiProvider,
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

  if (status === "loading" || !sessionToken) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading templates…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Templates & Drafts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Define the email subject and body using double curly braces for placeholders (e.g.
          <code className="mx-1 font-mono text-xs">{'{{first_name}}'}</code>
          or <code className="mx-1 font-mono text-xs">{'{{company|your company}}'}</code> for fallbacks).
          Preview the rendered copy on recent leads before sending.
        </p>
      </header>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-800">Brand Knowledge Onboarding</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ground the AI with your narrative, then layer in supporting sources. The more context you add, the
          more bespoke your outreach becomes.
        </p>
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1 • Core narrative</h3>
            <textarea
              value={knowledgeBase}
              onChange={(event) => setKnowledgeBase(event.target.value)}
              rows={6}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:border-slate-500 focus:outline-none"
              placeholder="Summarize your brand story, tone, ideal customer profile, proof points, and objections you handle best."
            />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2 • Add supporting sources</h3>
            <p className="mt-1 text-sm text-slate-600">Choose one or more options below. We append everything to your knowledge base so you can edit before saving.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <div className="rounded border border-slate-200 p-4">
                <h4 className="text-base font-medium text-slate-800">Scrape your website</h4>
                <p className="mt-1 text-sm text-slate-600">Paste your homepage or product URL. We pull readable copy only.</p>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  placeholder="https://www.example.com"
                  className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleWebsiteScrape}
                  disabled={websiteLoading}
                  className="mt-3 inline-flex items-center justify-center rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {websiteLoading ? 'Pulling…' : 'Pull website copy'}
                </button>
                {websiteError ? <p className="mt-2 text-xs text-rose-600">{websiteError}</p> : null}
              </div>
              <div className="rounded border border-slate-200 p-4">
                <h4 className="text-base font-medium text-slate-800">Link a Google Doc</h4>
                <p className="mt-1 text-sm text-slate-600">Share your pitch deck, scripting doc, or onboarding notes. Set the doc to viewable.</p>
                <input
                  type="url"
                  value={googleDocUrl}
                  onChange={(event) => setGoogleDocUrl(event.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleGoogleDocImport}
                  disabled={googleDocLoading}
                  className="mt-3 inline-flex items-center justify-center rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {googleDocLoading ? 'Importing…' : 'Import Google Doc'}
                </button>
                {googleDocError ? <p className="mt-2 text-xs text-rose-600">{googleDocError}</p> : null}
              </div>
              <div className="rounded border border-slate-200 p-4">
                <h4 className="text-base font-medium text-slate-800">Upload documents</h4>
                <p className="mt-1 text-sm text-slate-600">Drop playbooks, FAQs, or tone guides. You can upload multiple files at once.</p>
                <label className="mt-3 flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 px-3 py-6 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Select files
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.mdown,.pdf,.json"
                    multiple
                    onChange={handleKnowledgeFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="mt-2 text-xs text-slate-500">Supported: Markdown, plain text, JSON, PDF (we extract readable text).</p>
                {knowledgeUploadInfo ? (
                  <p className="mt-1 text-xs text-emerald-600">{knowledgeUploadInfo}</p>
                ) : null}
              </div>
            </div>
          </div>
          {knowledgeSources.length > 0 ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Linked sources
              </h4>
              <p className="mt-1 text-xs text-slate-600">
                We store summaries for quick drafting and keep the full text behind the scenes for deeper RAG use.
              </p>
              <ul className="mt-3 space-y-3 text-sm">
                {knowledgeSources
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((source) => (
                    <li key={source.id} className="rounded border border-slate-200 bg-white p-3">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {source.type === 'website'
                            ? 'Website'
                            : source.type === 'googleDoc'
                            ? 'Google Doc'
                            : 'Uploaded file'}
                        </span>
                        <span className="text-xs text-slate-400">
                          Added {new Date(source.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {source.title ?? source.url ?? 'Untitled source'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {source.summary}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {source.snippet}
                      </p>
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs font-medium text-slate-500 underline"
                        >
                          Open source ↗
                        </a>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3 • Save &amp; continue</h3>
              <p className="text-sm text-slate-600">Review the text above, make edits, then lock it in.</p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
              <button
                type="button"
                onClick={handleKnowledgeSave}
                disabled={knowledgeSaving}
                className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {knowledgeSaving ? 'Saving…' : 'Save knowledge base'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteIntent((prev) => !prev);
                  setDeleteConfirmText('');
                }}
                className="inline-flex items-center justify-center rounded border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                Delete knowledge base
              </button>
            </div>
          </div>
          {deleteIntent ? (
            <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <p>
                This will clear the summary and disconnect the linked sources from future drafting. Type
                <strong className="mx-1">{deletePhrase}</strong> to confirm.
              </p>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  className="flex-1 rounded border border-rose-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
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
                  className="inline-flex items-center justify-center rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Confirm deletion
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <div>
            <h2 className="text-lg font-medium text-slate-800">Sender Settings</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the Gmail account that will send approved drafts.
            </p>
            {gmailConnections.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No Gmail accounts connected yet. Connect one to unlock sending.
              </p>
            ) : (
              <label className="mt-3 flex flex-col gap-1 text-sm text-slate-700">
                Active Gmail connection
                <select
                  value={connectionSelectValue}
                  onChange={(event) => setSelectedConnectionId(event.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  {gmailConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.email}
                      {connection.needsReauth ? " (needs reconnect)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <a
              href={`/integrations/gmail/connect?projectId=${projectId}`}
              className="mt-3 inline-flex items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              Connect another account →
            </a>
            {gmailConnections.length > 0 && activeConnection?.needsReauth ? (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Gmail access for <span className="font-medium">{activeConnection.email}</span> has expired.
                Reconnect the account above to refresh permissions before sending emails.
              </div>
            ) : null}
            {gmailConnections.length > 0 && activeConnection?.lastError && !activeConnection.needsReauth ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Last Gmail response: {activeConnection.lastError}
                {activeConnection.lastErrorAt ? ` (${new Date(activeConnection.lastErrorAt).toLocaleString()})` : ""}
              </div>
            ) : null}
          </div>
          <div>
            <h2 className="text-lg font-medium text-slate-800">Lead Queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select the leads you want the AI to prioritize when generating drafts.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={leadSearch}
                onChange={(event) => setLeadSearch(event.target.value)}
                placeholder="Search by email, name, or company"
                className="w-full min-w-[220px] flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={selectAllFiltered}
                disabled={filteredLeads.length === 0}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={clearSelectedLeads}
                disabled={selectedLeadCount === 0}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => loadLeads()}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={loadingLeads}
              >
                {loadingLeads ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {selectedLeadCount} selected • {leadOptions.length} loaded • showing {filteredLeads.length} matching
            </p>
            {leadLoadError ? (
              <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {leadLoadError}
              </div>
            ) : null}
            <div className="mt-3 max-h-64 overflow-y-auto rounded border border-slate-200">
              {loadingLeads ? (
                <p className="px-3 py-3 text-sm text-slate-600">Loading latest leads…</p>
              ) : filteredLeads.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-600">No leads match the current filter.</p>
              ) : (
                <ul className="divide-y divide-slate-200 text-sm">
                  {filteredLeads.map((lead) => {
                    const checked = selectedLeadIds.includes(lead.id);
                    return (
                      <li key={lead.id} className="bg-white">
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-3 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLeadSelection(lead.id)}
                            className="mt-1 size-4 rounded border-slate-300"
                          />
                          <div>
                            <p className="font-medium text-slate-800">{lead.email}</p>
                            <p className="text-xs text-slate-500">
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

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-800">AI Template Studio</h2>
            <p className="mt-1 text-sm text-slate-600">
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
              setPreview(null);
              setAiDrafts(null);
              setHtmlDraft('');
              setActiveTemplateVersionId(null);
              setDesignerState(defaultDesignerState);
              setDesignMode('builder');
            }}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            New template
          </button>
        </div>
        <div className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          Template Studio is coming soon. We&apos;ll add visual presets and layout controls here once they&apos;re ready.
        </div>
        {false && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Curated presets</p>
              <p className="text-sm text-slate-600">Pick a starting point, then let AI strategically edit it.</p>
            </div>
            {selectedPreset ? (
              <button
                type="button"
                onClick={() => setSelectedPresetId(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Clear preset
              </button>
            ) : null}
          </div>
          {presetError ? (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {presetError}
            </div>
          ) : null}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {presetLoading && templatePresets.length === 0 ? (
              <div className="flex min-w-[280px] items-center justify-center rounded border border-slate-200 bg-slate-50 p-6 text-xs text-slate-500">
                Loading presets…
              </div>
            ) : null}
            {templatePresets.map((preset) => {
              const active = selectedPresetId === preset.id;
              return (
                <article
                  key={preset.id}
                  className={`min-w-[280px] max-w-[320px] flex-1 rounded-xl border ${
                    active ? 'border-emerald-500 bg-emerald-50/70' : 'border-slate-200 bg-white'
                  } shadow-sm transition`}
                >
                  <div className="flex flex-col gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{preset.name}</p>
                      <p className="text-xs text-slate-500">{preset.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <iframe title={preset.name} srcDoc={preset.html} className="h-36 w-full" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
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
          <aside className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            {templates.length === 0 ? (
              <p className="text-slate-600">No templates yet. Create one to get started.</p>
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
                        setPreview(null);
                        setAiDrafts(null);
                        setHtmlDraft(template.activeVersion?.htmlContent ?? '');
                        setActiveTemplateVersionId(template.activeVersion?.id ?? null);
                        setDesignerState(defaultDesignerState);
                        setDesignMode(template.activeVersion?.htmlContent ? 'html' : 'builder');
                      }}
                      className={`w-full rounded px-2 py-1 text-left ${
                        selectedId === template.id
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 hover:bg-slate-100"
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
                <span className="text-sm font-medium text-slate-700">Template name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-slate-700">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">
                Body (uses placeholders like {'{{first_name}}'})
              </span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                className="rounded border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">AI strategy notes (optional)</span>
              <textarea
                value={strategyNotes}
                onChange={(event) => setStrategyNotes(event.target.value)}
                rows={3}
                className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                placeholder="Tell the AI how to adjust tone, highlight a benefit, address an objection, or tweak the CTA."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save copy"}
              </button>
              <button
                type="button"
                onClick={handleDeleteTemplate}
                disabled={!selectedId || deletingTemplate}
                className="rounded border border-rose-400 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
              >
                {deletingTemplate ? "Deleting…" : "Delete template"}
              </button>
              <button
                type="button"
                onClick={() => handlePreview(5)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Preview on leads
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAiTemplateBundle()}
                disabled={suggestingTemplate}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {suggestingTemplate ? "Asking AI…" : "Ask AI to draft copy"}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateAi(3)}
                disabled={generatingAi}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {generatingAi
                  ? "Generating drafts…"
                  : enhancedPersonalization
                    ? "Generate personalized drafts"
                    : "Generate drafts"}
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Chat with AI
              </button>
            </div>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Template Studio layout tools are coming soon. We&apos;ll surface design controls here once they&apos;re ready.
            </div>
            {false && (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Layout & visuals</h3>
                      <p className="text-xs text-slate-500">
                        AI keeps the HTML version in sync with your copy. Switch modes below for quick tweaks or full control.
                      </p>
                      {activeVersion ? (
                        <p className="text-xs text-slate-500">
                          Active:{' '}
                          <span className="font-semibold text-slate-700">
                            {activeVersionTitle}
                          </span>{' '}
                          • Source: {activeVersionSourceLabel} • Updated {activeVersionUpdatedLabel}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">
                          No active HTML version yet. Generate with AI or save a layout to activate one.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveActiveVersion}
                        disabled={savingVersion}
                        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {savingVersion ? "Saving…" : activeVersion ? "Save layout" : "Save & activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateNewVersion(true)}
                        disabled={savingVersion}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {savingVersion ? "Saving…" : "Save as new active version"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">Mode</span>
                    <button
                      type="button"
                      onClick={() => setDesignMode('builder')}
                      className={`rounded px-3 py-1.5 text-sm font-medium ${
                        designMode === 'builder'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Guided builder
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesignMode('html')}
                      className={`rounded px-3 py-1.5 text-sm font-medium ${
                        designMode === 'html'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
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
                            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            Apply design to HTML editor
                          </button>
                        </>
                      ) : (
                        <label className="flex flex-col gap-2 text-sm text-slate-700">
                          <span className="font-medium">HTML template</span>
                          <textarea
                            value={htmlDraft}
                            onChange={(event) => setHtmlDraft(event.target.value)}
                            rows={20}
                            className="h-[360px] w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-500 focus:outline-none"
                            placeholder="Paste or design your HTML template here"
                          />
                        </label>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        <span className="font-medium">AI design brief (optional)</span>
                        <textarea
                          value={htmlSuggestionNotes}
                          onChange={(event) => setHtmlSuggestionNotes(event.target.value)}
                          rows={4}
                          className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                          placeholder="Describe colors, layout, tone, or goals for AI-generated templates"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleGenerateAiTemplateBundle({ designOnly: true })}
                        disabled={suggestingTemplate}
                        className="inline-flex items-center justify-center rounded border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        {suggestingTemplate ? "Refreshing designs…" : "Refresh layout with AI"}
                      </button>
                      <p className="text-xs text-slate-500">
                        Reuse the latest copy but ask AI to rethink the visual treatment. We keep your current HTML in case you want to undo.
                      </p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-slate-700">Live preview</h4>
                    <div className="mt-2 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
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
                      <details className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <summary className="cursor-pointer select-none font-semibold text-slate-700">
                          Plain text preview
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-600">
                          {builderPreviewText}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
                {htmlSuggestions?.length ? (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-sm font-medium text-slate-700">Alternate AI layouts</h3>
                      <button
                        type="button"
                        onClick={() => setHtmlSuggestions(undefined)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {(htmlSuggestions ?? []).map((suggestion) => (
                        <div key={suggestion.id} className="flex flex-col gap-3 rounded border border-slate-200 p-3 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{suggestion.title}</p>
                              {suggestion.description ? (
                                <p className="text-xs text-slate-500">{suggestion.description}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAdoptHtmlSuggestion(suggestion)}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Adopt
                            </button>
                          </div>
                          <div className="overflow-hidden rounded border border-slate-200">
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
                              className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
                <h3 className="text-sm font-medium text-slate-700">Version history</h3>
                <div className="space-y-2">
                  {selectedTemplate.versions.map((version) => (
                    <div
                      key={version.id}
                      className={`flex flex-col gap-2 rounded border px-3 py-2 text-sm md:flex-row md:items-center md:justify-between ${
                        version.isActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          {version.title}
                          {version.isActive ? ' (active)' : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          Source: {version.source === 'AI' ? 'AI' : 'Human'} • Updated {new Date(version.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadVersionIntoEditor(version)}
                          className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {!version.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleActivateVersion(version.id)}
                            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
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
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-800">Preview</h2>
            <p className="mt-1 text-sm text-slate-600">
              Auto-generated copy for recent leads. Adjust your template if anything looks off before sending.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleGenerateAi(
                  selectedLeadIds.length || 3,
                  selectedLeadIds.length > 0 ? selectedLeadIds : undefined
                )
              }
              disabled={generatingAi}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {generatingAi
                ? 'Regenerating…'
                : enhancedPersonalization
                  ? 'Regenerate personalized drafts'
                  : 'Regenerate drafts'}
            </button>
            <button
              type="button"
              onClick={handleSendPreview}
              disabled={
                !hasPreview ||
                previewSending ||
                !bulkSendEnabled ||
                !activeConnection ||
                activeConnection.needsReauth === true
              }
              className="inline-flex items-center justify-center rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {previewSending
                ? 'Sending previews…'
                : !activeConnection
                  ? 'Connect Gmail'
                  : activeConnection.needsReauth
                    ? 'Reconnect Gmail'
                    : !hasPreview
                      ? 'Generate previews first'
                      : bulkSendEnabled
                        ? 'Approve & send from preview'
                        : 'Enable bulk send'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={enhancedPersonalization}
              onChange={(event) => {
                setEnhancedPersonalization(event.target.checked);
                if (!event.target.checked) {
                  setAllowToolUse(true);
                }
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500/20"
            />
            <span>
              <strong>Enhanced personalization</strong> — add bespoke hooks for each lead.
              <br />
              When on, AI may use additional research context and can take slightly longer.
            </span>
          </label>
          <label className="flex items-start gap-2 pl-6 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={allowToolUse}
              disabled={!enhancedPersonalization}
              onChange={(event) => setAllowToolUse(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500/20"
            />
            <span>
              Allow research assistance (may incur higher AI usage). Turn off to keep copy strictly to known context.
            </span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={bulkSendEnabled}
              onChange={(event) => setBulkSendEnabled(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500/20"
            />
            <span>
              Enable one-click send from preview. When on, approving a draft sends immediately using the selected Gmail connection.
            </span>
          </label>
        </div>
        {hasPreview ? (
          <div className="mt-6 overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Send</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Lead</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Subject</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Body</th>
                </tr>
              </thead>
              <tbody>
                {(preview ?? []).map((row) => (
                  <tr key={row.leadId} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">
                      <button
                        type="button"
                        onClick={() => handleSendPreviewRow(row)}
                        disabled={
                          previewSendingId === row.leadId || previewSending || !bulkSendEnabled
                        }
                        className="rounded-full border border-slate-300 p-2 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                        aria-label={`Send email to ${row.email}`}
                      >
                        ✈️
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.email}</td>
                    <td className="px-3 py-2 text-slate-700">{row.subject}</td>
                    <td className="whitespace-pre-wrap px-3 py-2 text-slate-600">{row.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Generate previews to review personalized drafts and send from this panel. Use the lead selector above to choose who gets drafted first.
          </div>
        )}
      </section>

      {aiDrafts ? (
        <section className="rounded-lg border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-slate-800">AI Drafts ({aiProvider})</h2>
              <p className="mt-1 text-sm text-slate-600">
                Drafts generated automatically for recent leads.{" "}
                {activeConnection
                  ? `Approvals will send immediately from ${activeConnection.email}.`
                  : "Connect Gmail to approve and send without copying manually."}
              </p>
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={bulkSendEnabled}
                  onChange={(event) => setBulkSendEnabled(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500/20"
                />
                <span>
                  Enable one-click send for all ready drafts. Review copy first—this uses the selected Gmail connection immediately.
                </span>
              </label>
            </div>
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
              className="inline-flex items-center justify-center rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
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
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">Iteration guidance</span>
              <textarea
                value={iterationNotes}
                onChange={(event) => setIterationNotes(event.target.value)}
                rows={3}
                className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                placeholder="Optional notes for AI when improving drafts (tone tweaks, new CTA, etc.)"
              />
            </label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleIterateDrafts(aiDrafts ?? [])}
                disabled={bulkIterating || !aiDrafts || aiDrafts.length === 0}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
                className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {bulkIterating ? 'Iterating…' : 'Iterate selected leads'}
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {aiDrafts.map((draft) => (
              <article key={draft.leadId} className="rounded border border-slate-200 bg-slate-50 p-4">
                <header className="flex items-center justify-between text-sm text-slate-600">
                  <span>{draft.email}</span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase text-emerald-700">
                    AI generated
                  </span>
                </header>
                {draft.notes ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {draft.notes}
                  </p>
                ) : null}
                <h3 className="mt-2 text-base font-semibold text-slate-900">{draft.subject}</h3>
                <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{draft.body}</p>
                  <div>
                    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
                      <iframe
                        title={`Preview ${draft.email}`}
                        srcDoc={draft.html ?? `<div style="font-family: Arial, sans-serif; padding: 16px;">${draft.body.replace(/\n/g, '<br />')}</div>`}
                        className="h-48 w-full"
                      />
                    </div>
                  </div>
                </div>
                <label className="mt-3 flex flex-col gap-1 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Vibe prompt (optional)</span>
                  <textarea
                    value={vibeNotes[draft.leadId] ?? ''}
                    onChange={(event) =>
                      setVibeNotes((prev) => ({ ...prev, [draft.leadId]: event.target.value }))
                    }
                    rows={2}
                    className="rounded border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
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
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
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
                    className="rounded border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {iteratingDraftId === draft.leadId ? 'Vibing…' : 'Vibe edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIterateDraft(draft)}
                    disabled={iteratingDraftId === draft.leadId || bulkIterating}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {iteratingDraftId === draft.leadId ? 'Iterating…' : 'Quick improve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerateDraft(draft.leadId)}
                    disabled={generatingAi}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
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
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Recently Sent</h2>
          <p className="mt-1 text-sm text-slate-600">
            Approvals you&apos;ve completed in this session. Track which Gmail account handled each send.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Recipient</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Subject</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Sent at</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Gmail connection</th>
                </tr>
              </thead>
              <tbody>
                {sentLog.map((entry) => (
                  <tr key={entry.messageId} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{entry.email}</td>
                    <td className="px-3 py-2 text-slate-700">{entry.subject}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{entry.gmailConnectionEmail}</td>
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
