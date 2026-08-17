# Data Recon UI

Simple Streamlit-style React console for [Data Recon](https://github.com/mmsapre/DataRecon).
It talks to the Data Recon HTTP API using basic auth. Backend and agent URLs are **separate** and chosen per environment (`dev`, `uat`, `sit`, `prod`).

## Run

Start Data Recon first (`mvn mn:run` in `data-recon`). Then:

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
| Agent URL | Optional separate chat/agent service. Empty = built-in local agent, still calling the backend URL |

URLs are stored per env in the browser. Defaults come from Vite env files (copy [`.env.example`](.env.example) to `.env.local`):

```bash
VITE_DEFAULT_ENV=dev
VITE_DEV_BACKEND_URL=http://localhost:8080
VITE_DEV_AGENT_URL=
VITE_UAT_BACKEND_URL=https://data-recon.uat.example
VITE_UAT_AGENT_URL=https://recon-agent.uat.example
VITE_SIT_BACKEND_URL=
VITE_SIT_AGENT_URL=
VITE_PROD_BACKEND_URL=
VITE_PROD_AGENT_URL=
```

Do not put backend and agent on the same field. Leave Agent URL blank in `dev` unless you have a remote agent.

Remote agent contract: `POST {agentUrl}/chat` (or the URL as given if it already ends in `/chat`, `/agent`, `/messages`, or `/invoke`):

```json
{
  "message": "run party pg-pg",
  "env": "dev",
  "backendUrl": "http://localhost:8080",
  "domains": []
}
```

Expected JSON: `{ "text": "...", "reasoning": ["..."], "actions": [{ "name": "...", "detail": "..." }], "focus": { "domainId": "party", "runId": 1 } }`.

The Data Recon service allows the UI origin (`DATA_RECON_CORS_ORIGIN`, default `http://localhost:5173`) so the browser can call a backend URL that is not same-origin.

## Pages

| Page | What it does |
|---|---|
| Search & run | Search domains/profiles, attach named datasources, then **Run domain** or **Run profile** |
| Run recon | Same trigger with domain/profile pickers, optional mode / condition fields |
| Audit | All domain and profile runs, counts, stored queries, and per-key hashes |
| Setup | Add an in-memory domain or profile (datasource names must already exist in YAML) |
| Agent chat | Chat to search, attach, or trigger; **all reasoning is always visible** |

API-added domains/profiles are not persisted across a Data Recon restart.
Connection pools stay in YAML; **Add datasource** attaches those names to a profile.

## Search then trigger

1. Connect (`admin` / `admin` by default).
2. On **Search & run**, type a domain or profile name (`party`, `pg-csv`, `mongo`).
3. Optionally set **Mode** and **Condition fields**.
4. Click **Run domain** on a domain card, or **Run profile** on a row.
5. The console opens **Audit** on the accepted run. While a run is `RUNNING`, the table refreshes every few seconds.

## Audit

**Audit** loads `GET /api/runs` (every domain and profile, not only the latest). Click a row to see counts and stored hashes. Domain runs list their profile children; pick a profile row for per-key results. Business values are never shown.

Filter by domain, profile, kind (domain vs profile), run status, or latest-only.

## Agent examples

Each reply lists every reasoning step (catalog size, matched domain/profile, intent, HTTP path, accepted run ids). After a trigger, use **View run in Audit** to inspect counts and hashes.

```text
search csv
list party
attach landing and mongo to party pg-mongo
run party pg-pg
run party
trigger party pg-csv COUNTS
run party pg-pg condition fields party_name, status
```
