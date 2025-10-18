'use client';

import { useState } from 'react';
import type { AiConfigResponse, AiProvider } from '@email-automation/shared';

const PROVIDER_LABELS: Record<AiProvider, { name: string; helper: string; docs?: string }> = {
  openrouter: {
    name: 'OpenRouter',
    helper: 'Bring your own OpenRouter key to access community models like GLM-4.5 AIR.'
  },
  openai: {
    name: 'OpenAI',
    helper: 'Use your own OpenAI API key to access GPT-4o-mini or other GPT models.'
  },
  gemini: {
    name: 'Google Gemini',
    helper: 'Connect a Google AI Studio key to call Gemini 1.5 models.'
  }
};

interface AiSettingsFormProps {
  initialConfig: AiConfigResponse;
}

type ProviderFormState = {
  apiKey: string;
  model: string;
  clearKey: boolean;
  status?: 'idle' | 'saving' | 'success' | 'error';
  message?: string;
};

type ProviderStateMap = Record<AiProvider, ProviderFormState>;

type FetchError = {
  error?: string;
};

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const [config, setConfig] = useState<AiConfigResponse>({
    ...initialConfig,
    defaultProvider: 'gemini'
  });
  const [defaultStatus, setDefaultStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [defaultMessage, setDefaultMessage] = useState<string | null>(null);

  const [providerState, setProviderState] = useState<ProviderStateMap>(() => ({
    openrouter: {
      apiKey: '',
      model: initialConfig.providers.openrouter.model ?? '',
      clearKey: false,
      status: 'idle'
    },
    openai: {
      apiKey: '',
      model: initialConfig.providers.openai.model ?? '',
      clearKey: false,
      status: 'idle'
    },
    gemini: {
      apiKey: '',
      model: initialConfig.providers.gemini.model ?? '',
      clearKey: false,
      status: 'idle'
    }
  }));

  const resetProviderState = (provider: AiProvider, newConfig: AiConfigResponse) => {
    setProviderState((prev) => ({
      ...prev,
      [provider]: {
        apiKey: '',
        model: newConfig.providers[provider].model ?? '',
        clearKey: false,
        status: 'success',
        message: 'Saved'
      }
    }));
  };

  const setProviderSaving = (provider: AiProvider) => {
    setProviderState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: 'saving',
        message: undefined
      }
    }));
  };

  const setProviderError = (provider: AiProvider, message: string) => {
    setProviderState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        status: 'error',
        message
      }
    }));
  };

  const handleDefaultSave = async () => {
    setDefaultStatus('success');
    setDefaultMessage('Gemini is enforced as the default provider.');
  };

  const handleProviderSave = async (provider: AiProvider) => {
    const state = providerState[provider];
    const payload: Record<string, unknown> = { providers: {} };
    const providerPayload: Record<string, unknown> = {};

    const trimmedKey = state.apiKey.trim();
    const trimmedModel = state.model.trim();

    if (state.clearKey) {
      providerPayload.apiKey = '';
    } else if (trimmedKey.length > 0) {
      providerPayload.apiKey = trimmedKey;
    }

    if (trimmedModel !== (config.providers[provider].model ?? '')) {
      providerPayload.model = trimmedModel.length > 0 ? trimmedModel : null;
    }

    if (Object.keys(providerPayload).length === 0) {
      setProviderState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          status: 'success',
          message: 'Nothing to update'
        }
      }));
      return;
    }

    setProviderSaving(provider);

    (payload.providers as Record<string, unknown>)[provider] = providerPayload;

    try {
      const response = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as AiConfigResponse | FetchError;
      if (!response.ok) {
        throw new Error((data as FetchError).error ?? 'Failed to update provider settings');
      }

      const typed = data as AiConfigResponse;
      const nextConfig: AiConfigResponse = {
        ...typed,
        defaultProvider: 'gemini'
      };
      setConfig(nextConfig);
      resetProviderState(provider, nextConfig);
    } catch (error) {
      setProviderError(
        provider,
        error instanceof Error ? error.message : 'Unable to update provider settings'
      );
    }
  };

  const toggleClearKey = (provider: AiProvider, value: boolean) => {
    setProviderState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        clearKey: value,
        apiKey: value ? '' : prev[provider].apiKey
      }
    }));
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">AI Provider Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Bring your own API keys to control billing and model selection. Keys are encrypted at rest and
          stored per organization. You can also fall back to environment keys set by the VoltaMail team.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700" htmlFor="default-provider">
            Default provider
          </label>
          <select
            id="default-provider"
            value="gemini"
            onChange={() => {
              setConfig((prev) => ({ ...prev, defaultProvider: 'gemini' }));
            }}
            className="block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            disabled
          >
            <option value="gemini">Google Gemini (enforced)</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleDefaultSave}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Gemini is the default
        </button>
      </section>
      {defaultMessage && (
        <p
          className={
            defaultStatus === 'error'
              ? 'text-sm text-red-600'
              : 'text-sm text-slate-600'
          }
        >
          {defaultMessage}
        </p>
      )}

      <section className="space-y-6">
        {Object.entries(PROVIDER_LABELS).map(([providerId, meta]) => {
          const provider = providerId as AiProvider;
          const state = providerState[provider];
          const configEntry = config.providers[provider];
          const stored = configEntry?.hasKey;
          return (
            <div
              key={provider}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-medium text-slate-800">{meta.name}</h2>
                  <p className="text-sm text-slate-600">{meta.helper}</p>
                  {meta.docs ? (
                    <a
                      href={meta.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-xs font-medium text-slate-500 underline"
                    >
                      View docs
                    </a>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    stored ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {stored ? 'Key stored' : 'No key on file'}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  API key
                  <input
                    type="password"
                    value={state.apiKey}
                    onChange={(event) =>
                      setProviderState((prev) => ({
                        ...prev,
                        [provider]: {
                          ...prev[provider],
                          apiKey: event.target.value,
                          clearKey: false,
                          status: 'idle',
                          message: undefined
                        }
                      }))
                    }
                    placeholder={stored ? 'Enter new key to replace stored value' : 'sk-...'}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Preferred model
                  <input
                    type="text"
                    value={state.model}
                    onChange={(event) =>
                      setProviderState((prev) => ({
                        ...prev,
                        [provider]: {
                          ...prev[provider],
                          model: event.target.value,
                          status: 'idle',
                          message: undefined
                        }
                      }))
                    }
                    placeholder={configEntry?.model ?? ''}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/20"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Leave blank to use the provider default. Current: {configEntry?.model ?? 'default'}
                  </span>
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500/20"
                    checked={state.clearKey}
                    onChange={(event) => toggleClearKey(provider, event.target.checked)}
                  />
                  Remove stored key for this provider
                </label>
                <button
                  type="button"
                  onClick={() => handleProviderSave(provider)}
                  disabled={state.status === 'saving'}
                  className="inline-flex items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-70"
                >
                  {state.status === 'saving' ? 'Saving…' : 'Save provider settings'}
                </button>
              </div>
              {state.message ? (
                <p
                  className={`mt-2 text-sm ${
                    state.status === 'error' ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {state.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default AiSettingsForm;
