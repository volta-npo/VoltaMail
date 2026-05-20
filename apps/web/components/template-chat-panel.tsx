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
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-volta-dark/40 px-4 pb-6">
      <div className="flex w-full max-w-lg max-h-[80vh] flex-col overflow-hidden border-2 border-volta-dark bg-volta-surface shadow-neo-lg">
        <header className="flex items-center justify-between border-b-2 border-volta-dark bg-volta-dark px-4 py-3 text-white">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <span className="inline-block h-3 w-3 border-2 border-white bg-volta-accent" aria-hidden />
              Chat with Volta
            </h2>
            <p className="text-xs text-volta-stone-300">
              Refine copy in real time. Suggestions reference your current template and context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-white bg-transparent px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest text-white hover:bg-volta-accent hover:text-volta-dark"
          >
            Close
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto bg-volta-stone-50 px-4 py-4 text-sm text-volta-stone-700">
          {messages.length === 0 ? (
            <p className="text-center font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-stone-500">
              Ask for alternative subject lines, tone tweaks, or CTA ideas.
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-xs border-2 border-volta-dark px-3 py-2 text-sm shadow-neo-sm md:max-w-md ${
                    message.role === "assistant"
                      ? "bg-volta-surface text-volta-dark"
                      : "bg-volta-primary text-white"
                  }`}
                >
                  {message.content}
                  {message.role === "assistant" && message.updates ? (
                    <div className="mt-2 space-y-1 border-t-2 border-volta-dark pt-2 text-xs text-volta-stone-700">
                      <p className="font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-dark">Suggested updates</p>
                      {message.updates.subject ? (
                        <p><span className="font-bold text-volta-dark">Subject:</span> {message.updates.subject}</p>
                      ) : null}
                      {message.updates.body ? (
                        <p className="whitespace-pre-wrap"><span className="font-bold text-volta-dark">Body:</span> {'\n'}{message.updates.body}</p>
                      ) : null}
                      {message.updates.html ? (
                        <details className="border-2 border-volta-dark bg-volta-stone-100 p-2">
                          <summary className="cursor-pointer font-mono text-[0.7rem] font-bold uppercase tracking-widest text-volta-stone-700">HTML preview</summary>
                          <iframe className="mt-2 h-32 w-full border-2 border-volta-dark bg-volta-surface" srcDoc={message.updates.html} />
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
                              className={`inline-flex items-center border-2 border-volta-dark px-2 py-1 font-mono text-[0.7rem] font-bold uppercase tracking-widest shadow-neo-sm ${
                                applied
                                  ? "bg-volta-success text-white"
                                  : "bg-volta-accent text-volta-dark hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo"
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
          className="border-t-2 border-volta-dark bg-volta-surface px-4 py-3"
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
            className="w-full border-2 border-volta-dark bg-volta-surface px-3 py-2 text-sm font-medium text-volta-dark placeholder:text-volta-stone-400"
            placeholder="Ask for a variation, different angle, or personalized hook…"
            disabled={isSending}
          />
          {error ? <p className="mt-2 text-xs font-bold text-volta-danger">{error}</p> : null}
          <div className="mt-2 flex items-center justify-between text-xs text-volta-stone-500">
            <span className="font-mono uppercase tracking-widest text-[0.7rem] font-bold">Responses may incur additional AI usage.</span>
            <button
              type="submit"
              disabled={isSending}
              className="inline-flex items-center border-2 border-volta-dark bg-volta-primary px-3 py-1.5 text-xs font-bold text-white shadow-neo transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-neo-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-neo-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-neo-sm disabled:hover:translate-x-0 disabled:hover:translate-y-0"
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
