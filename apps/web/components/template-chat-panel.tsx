"use client";

import { useEffect, useRef, useState } from "react";
import type { AiChatMessage } from "@email-automation/shared";

interface TemplateChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: AiChatMessage[];
  onSend: (message: string) => void;
  isSending: boolean;
  error?: string | null;
  onApplyUpdate?: (updates: NonNullable<AiChatMessage['updates']>) => void;
}

export function TemplateChatPanel({ open, onClose, messages, onSend, isSending, error, onApplyUpdate }: TemplateChatPanelProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef<number>(0);
  const [lastAppliedKey, setLastAppliedKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      textareaRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 || messages.length > previousMessageCountRef.current) {
      setLastAppliedKey(null);
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40 px-4 pb-6">
      <div className="flex w-full max-w-lg max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Chat with Volta</h2>
            <p className="text-xs text-slate-500">
              Refine copy in real time. Suggestions reference your current template and context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 text-sm text-slate-700">
          {messages.length === 0 ? (
            <p className="text-center text-xs text-slate-500">
              Ask for alternative subject lines, tone tweaks, or CTA ideas.
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-xs rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-md ${
                    message.role === "assistant"
                      ? "bg-white text-slate-800"
                      : "bg-slate-900 text-white"
                  }`}
                >
                  {message.content}
                  {message.role === "assistant" && message.updates ? (
                    <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Suggested updates</p>
                      {message.updates.subject ? (
                        <p><span className="font-medium text-slate-700">Subject:</span> {message.updates.subject}</p>
                      ) : null}
                      {message.updates.body ? (
                        <p className="whitespace-pre-wrap"><span className="font-medium text-slate-700">Body:</span> {'\n'}{message.updates.body}</p>
                      ) : null}
                      {message.updates.html ? (
                        <details className="rounded border border-slate-200 bg-slate-100 p-2">
                          <summary className="cursor-pointer text-slate-600">HTML preview</summary>
                          <iframe className="mt-2 h-32 w-full rounded border border-slate-200 bg-white" srcDoc={message.updates.html} />
                        </details>
                      ) : null}
                      {onApplyUpdate ? (
                        (() => {
                          const messageKey = `${message.role}-${index}-${message.content.length}`;
                          const applied = lastAppliedKey === messageKey;

                          return (
                            <button
                              type="button"
                              onClick={() => {
                                onApplyUpdate(message.updates!);
                                setLastAppliedKey(messageKey);
                              }}
                              disabled={applied}
                              className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium ${
                                applied
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                  : "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                              } disabled:opacity-70`}
                            >
                              {applied ? "Applied ✓" : "Apply these changes"}
                            </button>
                          );
                        })()
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        <form
          ref={formRef}
          className="border-t border-slate-200 bg-white px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const value = String(formData.get("message") ?? "").trim();
            if (!value) {
              return;
            }
            onSend(value);
            form.reset();
            textareaRef.current?.focus();
          }}
        >
          <textarea
            ref={textareaRef}
            name="message"
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            placeholder="Ask for a variation, different angle, or personalized hook…"
            disabled={isSending}
          />
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Responses may incur additional AI usage.</span>
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {isSending ? "Thinking…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TemplateChatPanel;
