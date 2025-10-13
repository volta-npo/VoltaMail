"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/config";

type CanonicalField =
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "role"
  | "timezone"
  | "phone"
  | "address";

const FIELD_LABELS: Record<CanonicalField, string> = {
  email: "Email (required)",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  role: "Role / Title",
  timezone: "Timezone",
  phone: "Phone",
  address: "Address"
};

const LOCAL_STORAGE_KEY = (projectId: string) => `lead-import-mapping-${projectId}`;

interface ParsedRow {
  [key: string]: string | null;
}

interface ImportSummaryRow {
  email: string | null;
  status: "imported" | "skipped" | "invalid";
  reason?: string;
}

interface ImportSummary {
  inserted: number;
  skipped: number;
  invalid: number;
  rows: ImportSummaryRow[];
}

interface LeadImportPageProps {
  params: {
    projectId: string;
  };
}

export default function LeadImportPage({ params }: LeadImportPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<CanonicalField, string | "">>(() =>
    Object.keys(FIELD_LABELS).reduce(
      (acc, key) => ({ ...acc, [key as CanonicalField]: "" }),
      {} as Record<CanonicalField, string | "">
    )
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectId = params.projectId;
  const sessionToken = session?.sessionToken;

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY(projectId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<CanonicalField, string>;
        setMapping((prev) => ({ ...prev, ...parsed }));
      } catch {
        // ignore
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (headers.length === 0) {
      return;
    }

    const auto: Record<CanonicalField, string | ""> = {
      email: "",
      first_name: "",
      last_name: "",
      company: "",
      role: "",
      timezone: "",
      phone: "",
      address: ""
    };

    const normalizedHeaders = headers.map((header) =>
      header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
    );

    const tryMatch = (field: CanonicalField, matcher: (header: string) => boolean) => {
      const index = normalizedHeaders.findIndex(matcher);
      if (index >= 0) {
        auto[field] = headers[index];
      }
    };

    tryMatch("email", (value) => value === "email" || value.includes("email"));
    tryMatch("first_name", (value) => value === "first_name" || value.includes("first"));
    tryMatch("last_name", (value) => value === "last_name" || value.includes("last"));
    tryMatch("company", (value) => value === "company" || value.includes("company"));
    tryMatch("role", (value) => value === "role" || value.includes("title"));
    tryMatch("timezone", (value) => value.includes("timezone"));
    tryMatch("phone", (value) => value.includes("phone"));
    tryMatch("address", (value) => value.includes("address"));

    setMapping((prev) => ({ ...prev, ...auto }));
  }, [headers]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const currentUrl = window.location.href;
      router.replace(`/signin?callbackUrl=${encodeURIComponent(currentUrl)}`);
    }
  }, [status, router]);

  const previewRows = useMemo(() => rawRows.slice(0, 5), [rawRows]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Loading session…
      </main>
    );
  }

  if (!sessionToken) {
    return null;
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    setSummary(null);
    setError(null);

    if (!selected) {
      setFile(null);
      setRawRows([]);
      setHeaders([]);
      setStep(1);
      return;
    }

    Papa.parse(selected, {
      header: true,
      skipEmptyLines: true,
      encoding: "utf-8",
      complete: (results) => {
        if (results.errors?.length) {
          setError(`Parse error: ${results.errors[0].message}`);
          return;
        }

        const data = (results.data as ParsedRow[]).filter((row) =>
          Object.values(row).some((value) => value && value.toString().trim().length > 0)
        );

        if (data.length === 0) {
          setError("CSV file is empty.");
          return;
        }

        const columnNames = results.meta.fields ?? Object.keys(data[0] ?? {});
        if (!columnNames || columnNames.length === 0) {
          setError("Unable to determine CSV headers.");
          return;
        }

        setFile(selected);
        setRawRows(data);
        setHeaders(columnNames);
        setStep(2);
      },
      error: (parseError: Error) => {
        setError(parseError.message);
      }
    });
  };

  const handleMappingChange = (field: CanonicalField, value: string) => {
    setMapping((prev) => {
      const next = { ...prev, [field]: value };
      window.localStorage.setItem(LOCAL_STORAGE_KEY(projectId), JSON.stringify(next));
      return next;
    });
  };

  const buildNormalizedCsv = () => {
    const canonicalRows = rawRows.map((row) => {
      const normalized: Record<string, string> = {};

      Object.entries(row).forEach(([key, value]) => {
        if (value != null) {
          normalized[key] = value;
        }
      });

      (Object.keys(FIELD_LABELS) as CanonicalField[]).forEach((field) => {
        const selectedHeader = mapping[field];
        if (selectedHeader && row[selectedHeader] != null) {
          normalized[field] = row[selectedHeader] ?? "";
          if (selectedHeader !== field) {
            delete normalized[selectedHeader];
          }
        }
      });

      return normalized;
    });

    return Papa.unparse(canonicalRows, { header: true });
  };

  const handleSubmit = async () => {
    if (!file || !sessionToken) {
      setError("Missing file or session context.");
      return;
    }

    const emailHeader = mapping.email;
    if (!emailHeader) {
      setError("Email column must be mapped before importing.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const csv = buildNormalizedCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", blob, file.name.replace(/\\.csv$/i, "") + "-normalized.csv");

      const response = await fetch(`${API_BASE_URL}/v1/projects/${projectId}/leads/import`, {
        method: "POST",
        headers: {
          "x-session-token": sessionToken
        },
        body: formData
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }

      const result = (await response.json()) as ImportSummary;
      setSummary(result);
      setStep(3);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to import leads.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setFile(null);
    setRawRows([]);
    setHeaders([]);
    setSummary(null);
    setError(null);
    setStep(1);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header>
        <Link href={`/dashboard`} className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Import Leads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload a CSV, map columns, and import leads into this project. The importer keeps duplicates out
          and reports any invalid rows.
        </p>
        {searchParams?.get("projectName") ? (
          <p className="mt-2 text-sm text-slate-700">
            Project: <strong>{searchParams.get("projectName")}</strong>
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {step === 1 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Step 1: Upload CSV</h2>
          <p className="mt-1 text-sm text-slate-600">
            Your file should include at least an <strong>Email</strong> column. You can map additional fields
            on the next screen.
          </p>
          <div className="mt-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full cursor-pointer rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
        </section>
      ) : null}

      {step >= 2 && headers.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Step 2: Map Columns</h2>
          <p className="mt-1 text-sm text-slate-600">
            Confirm which CSV columns correspond to the known fields. Unmapped columns will be stored as
            custom data.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(Object.keys(FIELD_LABELS) as CanonicalField[]).map((field) => (
              <label key={field} className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">{FIELD_LABELS[field]}</span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(event) => handleMappingChange(field, event.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="">-- Unmapped --</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={resetWizard}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !mapping.email}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {isSubmitting ? "Importing…" : "Import leads"}
            </button>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-700">Preview (first 5 rows)</h3>
            <div className="mt-2 overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-700"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                      {headers.map((header) => (
                        <td key={header} className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {row[header] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 && summary ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-800">Import complete</h2>
          <p className="mt-1 text-sm text-slate-600">
            {summary.inserted} leads imported, {summary.skipped} skipped, {summary.invalid} invalid.
          </p>
          <div className="mt-4 max-h-72 overflow-y-auto rounded border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Reason</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row, index) => (
                  <tr key={`${row.email}-${index}`} className="odd:bg-white even:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{row.email ?? "—"}</td>
                    <td className="px-3 py-2 capitalize text-slate-600">{row.status}</td>
                    <td className="px-3 py-2 text-slate-500">{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={resetWizard}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Import another file
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Back to dashboard
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
