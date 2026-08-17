import type { Connection, Datasource, Domain, Profile, RecRecord, Run } from "./types";

const STORAGE_KEY = "data-recon-ui.connection";

export function loadConnection(): Connection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Connection;
    }
  } catch {
    /* ignore */
  }
  return { user: "admin", password: "admin" };
}

export function saveConnection(connection: Connection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

function authHeader(connection: Connection): string {
  return "Basic " + btoa(`${connection.user}:${connection.password}`);
}

async function request<T>(
  connection: Connection,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: authHeader(connection),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseError(text, response.status));
  }
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function parseError(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { error?: string; message?: string };
    return body.error || body.message || text || `HTTP ${status}`;
  } catch {
    return text || `HTTP ${status}`;
  }
}

export const api = {
  datasources: (c: Connection) => request<Datasource[]>(c, "/api/datasources"),
  domains: (c: Connection) => request<Domain[]>(c, "/api/domains"),
  domain: (c: Connection, id: string) => request<Domain>(c, `/api/domains/${id}`),
  createDomain: (c: Connection, body: unknown) =>
    request<Domain>(c, "/api/domains", { method: "POST", body: JSON.stringify(body) }),
  createProfile: (c: Connection, domainId: string, body: unknown) =>
    request<Profile>(c, `/api/domains/${domainId}/profiles`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  runDomain: (c: Connection, domainId: string, body?: unknown) =>
    request<{ domainId: string; domainRunId: number; runIds: Record<string, number> }>(
      c,
      `/api/domains/${domainId}/runs`,
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
    ),
  runProfile: (c: Connection, domainId: string, profileId: string, body?: unknown) =>
    request<{ domainId: string; profileId: string; runId: number }>(
      c,
      `/api/domains/${domainId}/profiles/${profileId}/runs`,
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
    ),
  domainRuns: (c: Connection, domainId: string, active?: boolean) =>
    request<Run[]>(
      c,
      `/api/domains/${domainId}/runs${active ? "?active=true" : ""}`,
    ),
  profileRuns: (c: Connection, domainId: string, profileId: string, active?: boolean) =>
    request<Run[]>(
      c,
      `/api/domains/${domainId}/profiles/${profileId}/runs${active ? "?active=true" : ""}`,
    ),
  records: (c: Connection, runId: number, status?: string) =>
    request<RecRecord[]>(
      c,
      `/api/runs/${runId}/records${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  attachDatasources: (
    c: Connection,
    domainId: string,
    profileId: string,
    body: { source?: string; target?: string },
  ) =>
    request<Profile>(c, `/api/domains/${domainId}/profiles/${profileId}/datasources`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};
