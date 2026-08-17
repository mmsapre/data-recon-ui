# Data Recon UI

Simple Streamlit-style React console for [Data Recon](https://github.com/mmsapre/DataRecon).
It talks to the Data Recon HTTP API (`localhost:8080` by default) using basic auth.

## Run

Start Data Recon first (`mvn mn:run` in `data-recon`). Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. Default login is `admin` / `admin`.

Vite proxies `/api` to `http://localhost:8080`, so the browser stays same-origin.

## Pages

| Page | What it does |
|---|---|
| Catalog | Search domains/profiles and attach named datasources |
| Run recon | Trigger a domain or one profile, optional mode / condition fields |
| Results | Run metrics, stored queries, per-key hashes |
| Setup | Add an in-memory domain or profile (datasource names must already exist in YAML) |
| Agent | Chat to search, attach datasources, or trigger runs, with visible reasoning |

API-added domains/profiles are not persisted across a Data Recon restart.
Connection pools stay in YAML; **Add datasource** attaches those names to a profile.

## Agent examples

```text
search csv
attach landing and mongo to party pg-mongo
run party pg-pg
run party COUNTS
```
