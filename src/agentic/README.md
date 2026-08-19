# Agentic surface (separate from operator UI)

This folder is the **only** place for agent chat tooling in the UI.

| Concern | Where it lives |
|---|---|
| Trigger / search / attach via chat | Here (`agent.ts`, `AgentPage.tsx`) |
| Profile status, metrics, match counts | Operator **Audit & status** page |
| Same enquiry for agents (planned) | **MCP server** — do not implement inside this chat |

When you add MCP tools, keep them out of `App.tsx` operator pages and out of this chat unless the tool is explicitly “trigger recon”.

## Profile trigger (agent)

Prefer name/id + counts vs details:

| Utterance | API |
|---|---|
| `run counts party.pg-pg` | `POST /api/profiles/runs/counts` `{ "profile": "party.pg-pg" }` |
| `run details pg-mongo` | `POST /api/profiles/runs/details` `{ "profile": "pg-mongo" }` |

Profile may be qualified id (`domain.profile`), profile id (if unique), or `{ domain, profile }`.
