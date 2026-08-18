/**
 * Agentic chat helpers — kept separate from the operator console.
 * A future MCP server will expose profile status, metrics, and match enquiry;
 * this module must not become that surface.
 */
import { api } from "../api";
import type { Connection, Domain, Profile, ReconRunBody } from "../types";

export type AgentAction = {
  name: string;
  detail: string;
};

export type AgentReply = {
  reasoning: string[];
  actions: AgentAction[];
  text: string;
  focus?: { domainId: string; profileId?: string; runId?: number };
};

const MODES = ["COUNTS", "MISMATCH_DETAILS", "FIELD_DETAILS"] as const;

export async function runAgent(
  connection: Connection,
  domains: Domain[],
  utterance: string,
  onReason?: (steps: string[]) => void,
): Promise<AgentReply> {
  const text = utterance.trim();
  const reasoning: string[] = [];
  const note = (step: string) => {
    reasoning.push(step);
    onReason?.([...reasoning]);
  };

  note(`Environment: ${connection.env}.`);
  note(`Backend endpoint: ${connection.backendUrl || "(relative /api)"}.`);
  if (connection.agentUrl?.trim()) {
    note(`Agent endpoint: ${connection.agentUrl}.`);
    return runRemoteAgent(connection, domains, text, reasoning, note);
  }
  note("Agent URL is empty, so I am using the local tool agent against the backend.");
  note("Status / metrics / match enquiry will move to an MCP server; this chat only triggers and searches.");
  return runLocalAgent(connection, domains, text, reasoning, note);
}

async function runRemoteAgent(
  connection: Connection,
  domains: Domain[],
  text: string,
  reasoning: string[],
  note: (step: string) => void,
): Promise<AgentReply> {
  if (!text) {
    note("Empty message, so there is nothing to send to the agent.");
    return {
      reasoning,
      actions: [],
      text: "Type a request such as “run party pg-pg” or “search profiles csv”.",
    };
  }
  note(`POST chat to the agent for env ${connection.env}.`);
  note("The agent is a separate service from Data Recon; backendUrl is passed so it can call recon APIs.");
  const payload = await api.agentChat(connection, {
    message: text,
    env: connection.env,
    backendUrl: connection.backendUrl,
    domains,
  });
  const reply = normalizeRemoteReply(payload);
  (reply.reasoning ?? []).forEach((step) => note(step));
  note("Remote agent returned a reply.");
  return {
    reasoning,
    actions: reply.actions ?? [],
    text: reply.text,
    focus: reply.focus,
  };
}

function normalizeRemoteReply(payload: unknown): AgentReply {
  const body = (payload ?? {}) as Record<string, unknown>;
  const reasoning = Array.isArray(body.reasoning) ? body.reasoning.map((item) => String(item)) : [];
  const actions = Array.isArray(body.actions)
    ? body.actions.map((item) => {
        const action = item as { name?: string; detail?: string };
        return { name: String(action.name ?? "action"), detail: String(action.detail ?? "") };
      })
    : [];
  const focusRaw = body.focus as AgentReply["focus"] | undefined;
  return {
    reasoning,
    actions,
    text: String(body.text ?? body.reply ?? body.message ?? JSON.stringify(payload)),
    focus: focusRaw,
  };
}

async function runLocalAgent(
  connection: Connection,
  domains: Domain[],
  text: string,
  reasoning: string[],
  note: (step: string) => void,
): Promise<AgentReply> {
  const lower = text.toLowerCase();

  note(`Read the request: “${text}”.`);
  note(
    `Catalog in memory: ${domains.length} domain(s), ${domains.reduce((sum, domain) => sum + domain.profiles.length, 0)} profile(s).`,
  );

  if (!text) {
    note("Empty message, so there is nothing to do.");
    return {
      reasoning,
      actions: [],
      text: "Type a request such as “run party pg-pg” or “search profiles csv”.",
    };
  }

  const domain = matchDomain(domains, text);
  const profile = matchProfile(domains, domain, text);
  const mode = MODES.find(
    (item) =>
      lower.includes(item.toLowerCase()) ||
      lower.includes(item.replaceAll("_", " ").toLowerCase()),
  );
  const conditionFields = parseConditionFields(text);
  const forceFull = /\b(force\s*full|full\s*run|forcefull)\b/i.test(text);

  note(
    domain
      ? `Matched domain “${domain.id}” from the message.`
      : "No domain name in the catalog matched the message.",
  );
  note(
    profile
      ? `Matched profile “${profile.domainId}.${profile.profileId}” (${profile.sourceDatasource} → ${profile.targetDatasource}).`
      : "No profile id in the catalog matched the message.",
  );
  note(mode ? `Matched recon mode override “${mode}”.` : "No mode keyword (COUNTS / MISMATCH_DETAILS / FIELD_DETAILS).");
  note(
    conditionFields
      ? `Matched condition fields: ${conditionFields.join(", ")}.`
      : "No condition-field list in the message.",
  );
  note(forceFull ? "forceFull=true (FULL run)." : "Default incremental unless no prior active run.");

  if (isSearch(lower)) {
    note("Intent: search the catalog.");
    return searchReply(domains, text, reasoning, domain, note);
  }

  if (isAttach(lower)) {
    note("Intent: attach named datasources to a profile.");
    return attachReply(connection, domains, text, reasoning, domain, profile, note);
  }

  if (isTrigger(lower) || looksLikeRunShortcut(text, domain, profile)) {
    note(isTrigger(lower) ? "Intent: trigger a recon run." : "Intent: short name looks like a run shortcut.");
    return triggerReply(connection, reasoning, domain, profile, mode, conditionFields, forceFull, note);
  }

  if (isList(lower)) {
    note("Intent: list catalog entries.");
    return searchReply(domains, text, reasoning, domain, note);
  }

  note("No trigger/search/attach verb was clear, so I treated this as a catalog search.");
  return searchReply(domains, text, reasoning, domain, note);
}

function isSearch(lower: string): boolean {
  return /\b(search|find|look up|lookup|where is|show me)\b/.test(lower);
}

function isList(lower: string): boolean {
  return /\b(list|catalog|what domains|what profiles)\b/.test(lower);
}

function isAttach(lower: string): boolean {
  return /\b(attach|bind|set datasource|add datasource|datasources)\b/.test(lower);
}

function isTrigger(lower: string): boolean {
  return /\b(run|trigger|reconcil|kick off|start)\b/.test(lower);
}

function looksLikeRunShortcut(text: string, domain: Domain | null, profile: Profile | null): boolean {
  const tokens = tokenize(text);
  return tokens.length <= 4 && (domain !== null || profile !== null);
}

function searchReply(
  domains: Domain[],
  text: string,
  reasoning: string[],
  domain: Domain | null,
  note: (step: string) => void,
): AgentReply {
  const query = searchNeedle(text);
  note(
    query
      ? `Search needle is “${query}”.`
      : "No extra search needle, so I will list the matched domain or the full catalog.",
  );
  const hits = filterCatalog(domains, query || domain?.id || "");
  if (hits.length === 0) {
    note("No domain or profile name contains that text.");
    return {
      reasoning,
      actions: [{ name: "search", detail: query || text }],
      text: `No domains or profiles matched “${query || text}”.`,
    };
  }
  note(
    `Matched ${hits.length} domain(s) and ${hits.reduce((sum, item) => sum + item.profiles.length, 0)} profile(s).`,
  );
  const lines = hits.flatMap((item) => {
    if (item.profiles.length === 0) {
      return [`- ${item.id} (no profiles)`];
    }
    return item.profiles.map(
      (profile) =>
        `- ${item.id}.${profile.profileId}  ${profile.sourceDatasource} → ${profile.targetDatasource}  (${profile.reconMode})`,
    );
  });
  return {
    reasoning,
    actions: [{ name: "search", detail: query || domain?.id || "*" }],
    text: lines.join("\n"),
  };
}

async function attachReply(
  connection: Connection,
  domains: Domain[],
  text: string,
  reasoning: string[],
  domain: Domain | null,
  profile: Profile | null,
  note: (step: string) => void,
): Promise<AgentReply> {
  if (!domain || !profile) {
    note("Attach needs both a domain and a profile. I could not resolve both from the message.");
    return {
      reasoning,
      actions: [],
      text: "Name a domain and profile, for example: attach landing and csv to party pg-csv.",
    };
  }
  const names = datasourceNames(text, domain, profile);
  if (!names.source && !names.target) {
    note("No datasource names besides the domain/profile tokens were found.");
    return {
      reasoning,
      actions: [],
      text: "Say which named datasources to attach, for example: attach source landing and target mongo on party pg-mongo.",
    };
  }
  note(`Resolved profile ${domain.id}.${profile.profileId}.`);
  note(`Will attach source=${names.source ?? "(unchanged)"} target=${names.target ?? "(unchanged)"}.`);
  note(`Calling PUT /api/domains/${domain.id}/profiles/${profile.profileId}/datasources`);
  const updated = await api.attachDatasources(connection, domain.id, profile.profileId, names);
  note("Attach succeeded.");
  return {
    reasoning,
    actions: [
      {
        name: "PUT datasources",
        detail: `/api/domains/${domain.id}/profiles/${profile.profileId}/datasources`,
      },
    ],
    text: `Attached on ${updated.domainId}.${updated.profileId}: ${updated.sourceDatasource} (${updated.sourceType}) → ${updated.targetDatasource} (${updated.targetType}).`,
  };
}

async function triggerReply(
  connection: Connection,
  reasoning: string[],
  domain: Domain | null,
  profile: Profile | null,
  mode: string | undefined,
  conditionFields: string[] | undefined,
  forceFull: boolean,
  note: (step: string) => void,
): Promise<AgentReply> {
  if (!domain) {
    note("A trigger needs a domain that exists in the catalog.");
    return {
      reasoning,
      actions: [],
      text: "I could not match a domain. Try “run party” or “run party pg-pg”.",
    };
  }
  const body: ReconRunBody | undefined =
    mode || conditionFields || forceFull
      ? {
          mode,
          conditionFields,
          forceFull: forceFull || undefined,
        }
      : undefined;
  if (mode) {
    note(`Mode override: ${mode}. Request body will include it.`);
  } else {
    note("No mode override; Data Recon will use the profile/domain recon policy.");
  }
  if (conditionFields) {
    note(`Condition fields override: ${conditionFields.join(", ")}.`);
  }
  if (forceFull) {
    note("forceFull=true — FULL scope.");
  }
  if (profile) {
    note(`Scope: one profile (${domain.id}.${profile.profileId}), not the whole domain.`);
    note(`Calling POST /api/domains/${domain.id}/profiles/${profile.profileId}/runs`);
    const result = await api.runProfile(connection, domain.id, profile.profileId, body);
    note(`API accepted profile run id ${result.runId}.`);
    return {
      reasoning,
      actions: [
        {
          name: "POST run profile",
          detail: `/api/domains/${domain.id}/profiles/${profile.profileId}/runs → ${result.runId}`,
        },
      ],
      text: `Triggered ${domain.id}.${profile.profileId}. Run id ${result.runId} was accepted.`,
      focus: { domainId: domain.id, profileId: profile.profileId, runId: result.runId },
    };
  }
  note(`Scope: whole domain ${domain.id} (${domain.profiles.length} profile(s)).`);
  note(`Calling POST /api/domains/${domain.id}/runs`);
  const result = await api.runDomain(connection, domain.id, body);
  const ids = Object.entries(result.runIds)
    .map(([name, id]) => `${name}=${id}`)
    .join(", ");
  note(`API accepted domain run ${result.domainRunId}. Profile runs: ${ids || "none"}.`);
  return {
    reasoning,
    actions: [{ name: "POST run domain", detail: `/api/domains/${domain.id}/runs → ${result.domainRunId}` }],
    text: `Triggered domain ${domain.id} (domain run ${result.domainRunId}). Profile runs: ${ids || "none"}.`,
    focus: { domainId: domain.id, runId: result.domainRunId },
  };
}

export function filterCatalog(domains: Domain[], query: string): Domain[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return domains;
  }
  return domains
    .map((domain) => {
      const domainHit =
        domain.id.toLowerCase().includes(needle) ||
        (domain.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
      const profiles = domain.profiles.filter((profile) =>
        [
          profile.profileId,
          profile.sourceDatasource,
          profile.targetDatasource,
          profile.reconMode,
          ...(profile.tags ?? []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      );
      if (domainHit) {
        return domain;
      }
      if (profiles.length === 0) {
        return null;
      }
      return { ...domain, profiles };
    })
    .filter((item): item is Domain => item !== null);
}

function matchDomain(domains: Domain[], text: string): Domain | null {
  const tokens = tokenize(text);
  const ranked = domains
    .map((domain) => ({ domain, score: scoreName(domain.id, tokens, text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.domain ?? null;
}

function matchProfile(domains: Domain[], domain: Domain | null, text: string): Profile | null {
  const tokens = tokenize(text);
  const pool = domain ? domain.profiles : domains.flatMap((item) => item.profiles);
  const ranked = pool
    .map((profile) => ({
      profile,
      score: Math.max(
        scoreName(profile.profileId, tokens, text),
        scoreName(`${profile.domainId}.${profile.profileId}`, tokens, text),
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.profile ?? null;
}

function datasourceNames(
  text: string,
  domain: Domain,
  profile: Profile,
): { source?: string; target?: string } {
  const skip = new Set(
    tokenize(
      `${domain.id} ${profile.profileId} attach bind set add datasource datasources source target to on and`,
    ),
  );
  const tokens = tokenize(text).filter(
    (token) => !skip.has(token) && !MODES.map((mode) => mode.toLowerCase()).includes(token),
  );
  const sourceMatch = text.match(/source\s+(\S+)/i);
  const targetMatch = text.match(/target\s+(\S+)/i);
  if (sourceMatch || targetMatch) {
    return {
      source: sourceMatch?.[1],
      target: targetMatch?.[1],
    };
  }
  return {
    source: tokens[0],
    target: tokens[1] ?? tokens[0],
  };
}

function parseConditionFields(text: string): string[] | undefined {
  const match = text.match(/condition(?:\s+fields?)?[:\s]+([a-zA-Z0-9_,\s]+)/i);
  if (!match) {
    return undefined;
  }
  const fields = match[1]
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !MODES.includes(item.toUpperCase() as (typeof MODES)[number]));
  return fields.length ? fields : undefined;
}

function searchNeedle(text: string): string {
  return text
    .replace(/\b(search|find|look up|lookup|list|show me|catalog|profiles?|domains?|for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length > 1);
}

function scoreName(name: string, tokens: string[], raw: string): number {
  const value = name.toLowerCase();
  if (raw.toLowerCase().includes(value)) {
    return 10 + value.length;
  }
  if (tokens.includes(value)) {
    return 8 + value.length;
  }
  if (tokens.some((token) => value.includes(token) && token.length >= 3)) {
    return 3 + value.length;
  }
  return 0;
}
