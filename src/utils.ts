import type { ReconRunBody } from "./types";

export function runBody(mode: string, fields: string, forceFull = false): ReconRunBody {
  const conditionFields = splitList(fields);
  return {
    mode: mode || undefined,
    conditionFields: conditionFields.length ? conditionFields : undefined,
    forceFull: forceFull || undefined,
  };
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [headers.map(escape).join(",")].concat(
    rows.map((row) => row.map(escape).join(",")),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
