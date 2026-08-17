import type { EnvName, EnvEndpoints } from "./types";

export const ENVS: EnvName[] = ["dev", "uat", "sit", "prod"];

function envValue(name: string): string {
  const value = import.meta.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function defaultEnv(): EnvName {
  const value = envValue("VITE_DEFAULT_ENV").toLowerCase();
  return ENVS.includes(value as EnvName) ? (value as EnvName) : "dev";
}

export function defaultEndpoints(): Record<EnvName, EnvEndpoints> {
  return {
    dev: {
      backendUrl: envValue("VITE_DEV_BACKEND_URL") || "http://localhost:8080",
      agentUrl: envValue("VITE_DEV_AGENT_URL"),
    },
    uat: {
      backendUrl: envValue("VITE_UAT_BACKEND_URL"),
      agentUrl: envValue("VITE_UAT_AGENT_URL"),
    },
    sit: {
      backendUrl: envValue("VITE_SIT_BACKEND_URL"),
      agentUrl: envValue("VITE_SIT_AGENT_URL"),
    },
    prod: {
      backendUrl: envValue("VITE_PROD_BACKEND_URL"),
      agentUrl: envValue("VITE_PROD_AGENT_URL"),
    },
  };
}

export function joinUrl(base: string, path: string): string {
  const root = base.trim().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (!root) {
    return suffix;
  }
  return `${root}${suffix}`;
}

export function agentChatUrl(agentUrl: string): string {
  const root = agentUrl.trim().replace(/\/+$/, "");
  if (!root) {
    return "";
  }
  if (/\/(chat|messages|invoke|agent)(\/|$)/i.test(root)) {
    return root;
  }
  return `${root}/chat`;
}
