import { agentChatUrl, defaultEndpoints, defaultEnv, ENVS, joinUrl } from "./config";
import type {
  Connection,
  Datasource,
  Domain,
  EnvName,
  Profile,
  RecRecord,
  ReconRunBody,
  Run,
} from "./types";
import type { DatasourceUpsertBody } from "./setupTypes";

const STORAGE_KEY = "data-recon-ui.connection";

export function loadConnection(): Connection {
  const endpoints = defaultEndpoints();
  const env = defaultEnv();
  const fallback: Connection = {
    env,
    backendUrl: endpoints[env].backendUrl,
    agentUrl: endpoints[env].agentUrl,
    user: "admin",
    password: "admin",
    endpoints,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const saved = JSON.parse(raw) as Partial<Connection>;
    const nextEnv: EnvName = ENVS.includes(saved.env as EnvName) ? (saved.env as EnvName) : env;
    const merged = {
      ...endpoints,
      ...(saved.endpoints ?? {}),
    };
    for (const name of ENVS) {
      merged[name] = {
        backendUrl: saved.endpoints?.[name]?.backendUrl ?? endpoints[name].backendUrl,
        agentUrl: saved.endpoints?.[name]?.agentUrl ?? endpoints[name].agentUrl,
      };
    }
    return {
      env: nextEnv,
      backendUrl: saved.backendUrl ?? merged[nextEnv].backendUrl,
      agentUrl: saved.agentUrl ?? merged[nextEnv].agentUrl,
      user: saved.user || "admin",
      password: saved.password || "admin",
      endpoints: merged,
    };
  } catch {
    return fallback;
  }
}

export function saveConnection(connection: Connection) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

export function selectEnv(connection: Connection, env: EnvName): Connection {
  const urls = connection.endpoints[env];
  return {
    ...connection,
    env,
    backendUrl: urls.backendUrl,
    agentUrl: urls.agentUrl,
  };
}

export function updateCurrentUrls(
  connection: Connection,
  patch: { backendUrl?: string; agentUrl?: string },
): Connection {
  const backendUrl = patch.backendUrl ?? connection.backendUrl;
  const agentUrl = patch.agentUrl ?? connection.agentUrl;
  return {
    ...connection,
    backendUrl,
    agentUrl,
    endpoints: {
      ...connection.endpoints,
      [connection.env]: { backendUrl, agentUrl },
    },
  };
}

function authHeader(connection: Connection): string {
  return "Basic " + btoa(`${connection.user}:${connection.password}`);
}

function resolveUrl(connection: Connection, path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return joinUrl(connection.backendUrl, path);
}

async function request<T>(
  connection: Connection,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(resolveUrl(connection, path), {
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
  createDatasource: (c: Connection, body: DatasourceUpsertBody) =>
    request<Datasource>(c, "/api/datasources", { method: "POST", body: JSON.stringify(body) }),
  domains: (c: Connection) => request<Domain[]>(c, "/api/domains"),
  domain: (c: Connection, id: string) => request<Domain>(c, `/api/domains/${id}`),
  createDomain: (c: Connection, body: unknown) =>
    request<Domain>(c, "/api/domains", { method: "POST", body: JSON.stringify(body) }),
  createProfile: (c: Connection, domainId: string, body: unknown) =>
    request<Profile>(c, `/api/domains/${domainId}/profiles`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  runDomain: (c: Connection, domainId: string, body?: ReconRunBody) =>
    request<{ domainId: string; domainRunId: number; runIds: Record<string, number> }>(
      c,
      `/api/domains/${domainId}/runs`,
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
    ),
  runProfile: (c: Connection, domainId: string, profileId: string, body?: ReconRunBody) =>
    request<{ domainId: string; profileId: string; runId: number }>(
      c,
      `/api/domains/${domainId}/profiles/${profileId}/runs`,
      { method: "POST", body: body ? JSON.stringify(body) : undefined },
    ),
  runs: (c: Connection, active?: boolean) =>
    request<Run[]>(c, `/api/runs${active ? "?active=true" : ""}`),
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
  /** Latest active profile runs — operator status / metrics (MCP will mirror this). */
  activeProfileStatus: async (c: Connection) => {
    const runs = await request<Run[]>(c, "/api/runs?active=true");
    return runs.filter((run) => run.profileId);
  },
  records: (c: Connection, runId: number, status?: string) =>
    request<RecRecord[]>(
      c,
      `/api/runs/${runId}/records${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  attachDomainDatasources: (
    c: Connection,
    domainId: string,
    body: { source?: string; target?: string },
  ) =>
    request<Domain>(c, `/api/domains/${domainId}/datasources`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
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
  agentChat: (c: Connection, body: unknown) => {
    const url = agentChatUrl(c.agentUrl);
    if (!url) {
      throw new Error("Agent URL is empty for this environment.");
    }
    return request<unknown>(c, url, { method: "POST", body: JSON.stringify(body) });
  },
};
