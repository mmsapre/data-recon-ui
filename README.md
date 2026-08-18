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
| Search & run | **API dropdowns** for domain/profile quick run, catalog browse, attach datasources |
| Run recon | Dedicated execute form: pick domain/profile from `GET /api/domains`, then Run |
| Audit & status | Domain/profile dropdowns, historical runs, **mismatches on row select**, **time trend chart by profile**, **Export CSV** |
| Setup | Register **Postgres / Mongo / BigQuery** only; domains/profiles; optional **LLM** url/key/model |

### Run flow

1. Connect → domains/profiles load from the API (backed by recon config / catalog).
2. On **Run recon** (or Search & run quick run), select **Domain** and **Profile** from dropdowns.
3. Optionally set mode / condition fields / Force full.
4. Click **Run** → opens Audit on that run.

### Audit & status

1. Filter with **Domain** and **Profile** dropdowns (API catalog).
2. **Trend chart** shows matched / mismatched / source-only / target-only over time for the selected profile (last 30 runs).
3. Click a **historical row** → mismatch detail table loads (default `MISMATCHED`) with payloads when present.
4. **Export runs CSV** / **Export mismatches CSV** download the current tables.

### Incremental vs force full

POST run bodies accept `forceFull: true`. Without it, Data Recon uses an **INCREMENTAL** scope when an active prior run exists; otherwise **FULL**. Audit shows `runScope` and `baselineRunId`.

### Status & metrics (operator / future MCP)

`GET /api/runs` (and `?active=true`) drive status panels and charts:

- profile run status (`COMPLETED` / `RUNNING` / `FAILED`)
- matched / mismatched / source-only / target-only counts
- scope and baseline

A future MCP server should wrap the same enquiry for agents — do not fold that into agentic chat.

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
