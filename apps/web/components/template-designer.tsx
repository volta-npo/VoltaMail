"use client";

import { useEffect } from "react";

export interface TemplateDesignerState {
  layout: "classic" | "spotlight";
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  headline: string;
  intro: string;
  bulletOne: string;
  bulletTwo: string;
  bulletThree: string;
  closing: string;
  signature: string;
  ctaLabel: string;
  ctaUrl: string;
}

export interface TemplateDesignerProps {
  value: TemplateDesignerState;
  onChange: (value: TemplateDesignerState) => void;
  onPreview: (html: string, text: string) => void;
  disabled?: boolean;
}

export const defaultDesignerState: TemplateDesignerState = {
  layout: "classic",
  primaryColor: "#2563EB",
  accentColor: "#F97316",
  backgroundColor: "#F8FAFC",
  headline: "Let's collaborate",
  intro: "I'm reaching out because I noticed your team is investing in customer growth.",
  bulletOne: "Increase reply rates with fully personalized outreach",
  bulletTwo: "Blend your brand story with real-time lead research",
  bulletThree: "Launch campaigns in minutes, not weeks",
  closing: "Would you be open to a quick walkthrough this week?",
  signature: "Alex • VoltaMail",
  ctaLabel: "See how it works",
  ctaUrl: "https://yourcompany.com/demo"
};

export function buildHtmlFromDesigner(state: TemplateDesignerState): { html: string; text: string } {
  const bulletItems = [state.bulletOne, state.bulletTwo, state.bulletThree]
    .filter((item) => item && item.trim().length > 0)
    .map((item) => `<li style="margin-bottom: 6px;">${item}</li>`) // validated
    .join("\n");

  const textBullets = [state.bulletOne, state.bulletTwo, state.bulletThree]
    .filter((item) => item && item.trim().length > 0)
    .map((item) => `• ${item}`)
    .join("\n");

  const layoutWrapper = state.layout === "spotlight"
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="width: 12px; background-color: ${state.accentColor};"></td><td style="background-color: #ffffff; padding: 32px 40px; border-radius: 0 12px 12px 0;">{{content}}</td></tr></table>`
    : `<div style="background-color: #ffffff; padding: 32px 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">{{content}}</div>`;

  const innerHtml = `
    <p style="color: ${state.primaryColor}; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 12px;">${state.intro}</p>
    <h1 style="font-size: 26px; line-height: 1.3; color: #0F172A; margin: 0 0 16px;">${state.headline}</h1>
    ${bulletItems.length > 0 ? `<ul style="padding-left: 18px; margin: 0 0 18px; color: #475569; font-size: 15px;">${bulletItems}</ul>` : ''}
    <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 18px;">${state.closing}</p>
    <a href="${state.ctaUrl}" style="display: inline-block; background-color: ${state.primaryColor}; color: #ffffff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">${state.ctaLabel}</a>
    <p style="color: #64748B; font-size: 14px; margin: 20px 0 0;">${state.signature}</p>
  `;

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0; padding:24px; background-color: ${state.backgroundColor}; font-family: 'Inter', Arial, sans-serif;">
      ${layoutWrapper.replace("{{content}}", innerHtml)}
    </body>
  </html>`;

  const text = `${state.headline}\n\n${state.intro}\n\n${textBullets}\n\n${state.closing}\n\n${state.ctaLabel}: ${state.ctaUrl}\n\n${state.signature}`;

  return { html, text };
}

export function TemplateDesigner(props: TemplateDesignerProps) {
  const { value, onChange, onPreview, disabled } = props;

  useEffect(() => {
    const { html, text } = buildHtmlFromDesigner(value);
    onPreview(html, text);
  }, [value, onPreview]);

  const handleFieldChange = (key: keyof TemplateDesignerState, fieldValue: string) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Headline</span>
          <input
            value={value.headline}
            onChange={(event) => handleFieldChange("headline", event.target.value)}
            disabled={disabled}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Intro line</span>
          <input
            value={value.intro}
            onChange={(event) => handleFieldChange("intro", event.target.value)}
            disabled={disabled}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Primary color</span>
          <input
            type="color"
            value={value.primaryColor}
            onChange={(event) => handleFieldChange("primaryColor", event.target.value)}
            disabled={disabled}
            className="h-10 w-full cursor-pointer rounded border border-slate-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Accent color</span>
          <input
            type="color"
            value={value.accentColor}
            onChange={(event) => handleFieldChange("accentColor", event.target.value)}
            disabled={disabled}
            className="h-10 w-full cursor-pointer rounded border border-slate-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Background color</span>
          <input
            type="color"
            value={value.backgroundColor}
            onChange={(event) => handleFieldChange("backgroundColor", event.target.value)}
            disabled={disabled}
            className="h-10 w-full cursor-pointer rounded border border-slate-200"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        <span className="font-medium">Key benefits (one per line)</span>
        <textarea
          value={[value.bulletOne, value.bulletTwo, value.bulletThree].filter(Boolean).join("\n")}
          onChange={(event) => {
            const lines = event.target.value.split(/\r?\n/);
            handleFieldChange("bulletOne", lines[0] ?? "");
            handleFieldChange("bulletTwo", lines[1] ?? "");
            handleFieldChange("bulletThree", lines[2] ?? "");
          }}
          disabled={disabled}
          rows={3}
          className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Closing line</span>
          <textarea
            value={value.closing}
            onChange={(event) => handleFieldChange("closing", event.target.value)}
            disabled={disabled}
            rows={2}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">Signature</span>
          <textarea
            value={value.signature}
            onChange={(event) => handleFieldChange("signature", event.target.value)}
            disabled={disabled}
            rows={2}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">CTA label</span>
          <input
            value={value.ctaLabel}
            onChange={(event) => handleFieldChange("ctaLabel", event.target.value)}
            disabled={disabled}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span className="font-medium">CTA link</span>
          <input
            value={value.ctaUrl}
            onChange={(event) => handleFieldChange("ctaUrl", event.target.value)}
            disabled={disabled}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700">Layout</span>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name="designer-layout"
            value="classic"
            checked={value.layout === "classic"}
            onChange={() => handleFieldChange("layout", "classic")}
            disabled={disabled}
          />
          Classic card
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="radio"
            name="designer-layout"
            value="spotlight"
            checked={value.layout === "spotlight"}
            onChange={() => handleFieldChange("layout", "spotlight")}
            disabled={disabled}
          />
          Spotlight stripe
        </label>
      </div>
    </div>
  );
}
