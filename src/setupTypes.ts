import type { Datasource } from "./types";

export type DatasourceKind = "postgres" | "mongo" | "bigquery";

export const DATASOURCE_KINDS: DatasourceKind[] = ["postgres", "mongo", "bigquery"];

export function isSupportedDatasource(ds: Datasource): boolean {
  const type = (ds.type || "").toLowerCase();
  return type === "postgres" || type === "mongo" || type === "bigquery";
}

export type DatasourceUpsertBody = {
  name: string;
  type: DatasourceKind;
  tags?: string[];
  // postgres
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  url?: string;
  // mongo
  uri?: string;
  authDatabase?: string;
  // bigquery
  projectId?: string;
  dataset?: string;
  credentialsFile?: string;
  jdbcUrl?: string;
  catalog?: string;
};

export type LlmSettings = {
  url: string;
  apiKey: string;
  model: string;
};

const LLM_STORAGE_KEY = "data-recon-ui.llm";

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY);
    if (!raw) {
      return { url: "", apiKey: "", model: "gpt-4o-mini" };
    }
    const saved = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      url: saved.url ?? "",
      apiKey: saved.apiKey ?? "",
      model: saved.model || "gpt-4o-mini",
    };
  } catch {
    return { url: "", apiKey: "", model: "gpt-4o-mini" };
  }
}

export function saveLlmSettings(settings: LlmSettings) {
  localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(settings));
}

export function llmConfigured(settings: LlmSettings): boolean {
  return Boolean(settings.url.trim() && settings.apiKey.trim());
}
