import type { DataRow } from "./types";

export function columnsOf(rows: DataRow[]): string[] {
  const columns: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  return columns;
}

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: DataRow[]): string {
  const columns = columnsOf(rows);
  const lines = [columns.map(escapeCsv).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCsv(row[c])).join(","));
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
