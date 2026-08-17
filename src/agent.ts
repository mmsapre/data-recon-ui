import { api } from "./api";
import type { Connection, Domain, Profile } from "./types";

export type AgentAction = {
  name: string;
  detail: string;
};

export type AgentReply = {
  reasoning: string[];
  actions: AgentAction[];
  text: string;
};

const MODES = ["COUNTS", "MISMATCH_DETAILS", "FIELD_DETAILS"] as const;

export async function runAgent(
  connection: Connection,
  domains: Domain[],
  utterance: string,
): Promise<AgentReply> {
  const text = utterance.trim();
  const lower = text.toLowerCase();
  const reasoning: string[] = [`Read the request: “${text}”.`];

  if (!text) {
    return {
      reasoning: ["Empty message, so there is nothing to do."],
      actions: [],
      text: "Type a request such as “run party pg-pg” or “search profiles csv”.",
    };
  }

  const domain = matchDomain(domains, text);
  const profile = matchProfile(domains, domain, text);
  const mode = MODES.find((item) => lower.includes(item.toLowerCase()) || lower.includes(item.replaceAll("_", " ").toLowerCase()));

  if (isSearch(lower)) {
    return searchReply(domains, text, reasoning, domain);
  }

  if (isAttach(lower)) {
    return attachReply(connection, domains, text, reasoning, domain, profile);
  }

  if (isTrigger(lower) || looksLikeRunShortcut(text, domain, profile)) {
    return triggerReply(connection, reasoning, domain, profile, mode);
  }

  if (isList(lower)) {
    return searchReply(domains, text, reasoning, domain);
  }

  reasoning.push("No trigger/search/attach verb was clear, so I treated this as a catalog search.");
  return searchReply(domains, text, reasoning, domain);
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
): AgentReply {
  const query = searchNeedle(text);
  reasoning.push(
    query
      ? `Search needle is “${query}”.`
      : "No extra search needle, so I will list the matched domain or the full catalog.",
  );
  const hits = filterCatalog(domains, query || domain?.id || "");
  if (hits.length === 0) {
    reasoning.push("No domain or profile name contains that text.");
    return {
      reasoning,
      actions: [{ name: "search", detail: query || text }],
      text: `No domains or profiles matched “${query || text}”.`,
    };
  }
  reasoning.push(`Matched ${hits.length} domain(s).`);
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
): Promise<AgentReply> {
  if (!domain || !profile) {
    reasoning.push("Attach needs both a domain and a profile. I could not resolve both from the message.");
    return {
      reasoning,
      actions: [],
      text: "Name a domain and profile, for example: attach landing and csv to party pg-csv.",
    };
  }
  const names = datasourceNames(text, domain, profile);
  if (!names.source && !names.target) {
    reasoning.push("No datasource names besides the domain/profile tokens were found.");
    return {
      reasoning,
      actions: [],
      text: "Say which named datasources to attach, for example: attach source landing and target mongo on party pg-mongo.",
    };
  }
  reasoning.push(`Resolved profile ${domain.id}.${profile.profileId}.`);
  reasoning.push(
    `Will attach source=${names.source ?? "(unchanged)"} target=${names.target ?? "(unchanged)"}.`,
  );
  const updated = await api.attachDatasources(connection, domain.id, profile.profileId, names);
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
): Promise<AgentReply> {
  if (!domain) {
    reasoning.push("A trigger needs a domain that exists in the catalog.");
    return {
      reasoning,
      actions: [],
      text: "I could not match a domain. Try “run party” or “run party pg-pg”.",
    };
  }
  const body = mode ? { mode } : undefined;
  if (mode) {
    reasoning.push(`Mode override: ${mode}.`);
  } else {
    reasoning.push("No mode override; Data Recon will use the profile/domain recon policy.");
  }
  if (profile) {
    reasoning.push(`Triggering one profile: ${domain.id}.${profile.profileId}.`);
    const result = await api.runProfile(connection, domain.id, profile.profileId, body);
    return {
      reasoning,
      actions: [
        {
          name: "POST run",
          detail: `/api/domains/${domain.id}/profiles/${profile.profileId}/runs`,
        },
      ],
      text: `Triggered ${domain.id}.${profile.profileId}. Run id ${result.runId} was accepted.`,
    };
  }
  reasoning.push(`No profile token matched, so I will trigger every profile in domain ${domain.id}.`);
  const result = await api.runDomain(connection, domain.id, body);
  const ids = Object.entries(result.runIds)
    .map(([name, id]) => `${name}=${id}`)
    .join(", ");
  return {
    reasoning,
    actions: [{ name: "POST run", detail: `/api/domains/${domain.id}/runs` }],
    text: `Triggered domain ${domain.id} (domain run ${result.domainRunId}). Profile runs: ${ids || "none"}.`,
  };
}

export function filterCatalog(domains: Domain[], query: string): Domain[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return domains;
  }
  return domains
    .map((domain) => {
      const domainHit = domain.id.toLowerCase().includes(needle);
      const profiles = domain.profiles.filter((profile) =>
        [profile.profileId, profile.sourceDatasource, profile.targetDatasource, profile.reconMode]
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
    tokenize(`${domain.id} ${profile.profileId} attach bind set add datasource datasources source target to on and`),
  );
  const tokens = tokenize(text).filter((token) => !skip.has(token) && !MODES.map((mode) => mode.toLowerCase()).includes(token));
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
