# Data Recon UI

Operator console for [Data Recon](https://github.com/mmsapre/DataRecon), plus a **separate** agentic chat surface.

| Surface | Purpose |
|---|---|
| **Operator** (Search & run, Run recon, Audit & status, Setup) | Humans: trigger runs, view profile status, metrics, match / mismatch counts |
| **Agentic** (`src/agentic/`) | Chat to search / attach / trigger only — **not** status enquiry |
| **MCP (planned)** | Agents: profile status, enquire metrics, match status — keep out of operator UI |

Backend and agent URLs are separate and chosen per environment (`dev`, `uat`, `sit`, `prod`).

## Run

Start Data Recon first (`mvn spring-boot:run` in `data-recon`). Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. Default login is `admin` / `admin`.

## Environments and endpoints

Pick **Environment** in the sidebar, then set:

| Field | Used for |
|---|---|
| Backend URL | Data Recon API (`/api/domains`, `/api/runs`, …) |
| Agent URL | Optional separate chat/agent service. Empty = built-in local agent in `src/agentic/` |

URLs are stored per env in the browser. Defaults come from Vite env files (copy [`.env.example`](.env.example) to `.env.local`).

Do not put backend and agent on the same field. Leave Agent URL blank in `dev` unless you have a remote agent.

The Data Recon service allows the UI origin (`DATA_RECON_CORS_ORIGIN`, default `http://localhost:5173`).

## Operator pages

| Page | What it does |
|---|---|
| Search & run | Search domains/profiles (incl. tags), attach datasources, trigger with **Incremental** (default) or **Force full** |
| Run recon | Same trigger with pickers |
| Audit & status | **Active profile status** (metrics + match counts), run history with `runScope` / `baselineRunId`, per-key hashes and payloads |
| Setup | Add in-memory domain or profile |

### Incremental vs force full

POST run bodies accept `forceFull: true`. Without it, Data Recon uses an **INCREMENTAL** scope when an active prior run exists; otherwise **FULL**. Audit shows `runScope` and `baselineRunId`.

### Status & metrics (operator / future MCP)

`GET /api/runs?active=true` drives the **Active profile status** panel:

- profile run status (`COMPLETED` / `RUNNING` / `FAILED`)
- matched / mismatched / source-only / target-only counts
- scope and baseline

A future MCP server should wrap the same enquiry (profile status, metrics, match status) for agents — do not fold that into the operator pages or into agentic chat.

## Agentic (separate)

Nav group **Agentic · MCP later** → `src/agentic/`.

Chat can search, attach, or trigger (including “force full”). It does **not** answer profile status / metrics / match questions; use Audit or MCP for that.

```text
search csv
list party
attach landing and mongo to party pg-mongo
run party pg-pg
run party force full
trigger party pg-csv COUNTS
```

Remote agent contract: `POST {agentUrl}/chat` with `{ message, env, backendUrl, domains }` → `{ text, reasoning, actions, focus }`.

## Search then trigger

1. Connect (`admin` / `admin` by default).
2. On **Search & run**, type a domain or profile name (or tag).
3. Optionally set Mode, Condition fields, and Run scope (Incremental / Force full).
4. Click **Run domain** or **Run profile**.
5. **Audit & status** opens on the accepted run and refreshes while `RUNNING`.
