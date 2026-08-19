import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import {
  DATASOURCE_KINDS,
  isSupportedDatasource,
  llmConfigured,
  loadLlmSettings,
  saveLlmSettings,
  type DatasourceKind,
  type LlmSettings,
} from "./setupTypes";
import type { Connection, Datasource, Domain } from "./types";
import { message, splitList } from "./utils";

/** Setup: register PG / Mongo / BigQuery only; optional LLM key for summaries. */
export function SetupPage({
  connection,
  datasources,
  domains,
  busy,
  onBusy,
  onError,
  onNotice,
  onRefresh,
}: {
  connection: Connection;
  datasources: Datasource[];
  domains: Domain[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  onRefresh: () => void;
}) {
  const supported = useMemo(() => datasources.filter(isSupportedDatasource), [datasources]);
  const names = useMemo(() => supported.map((item) => item.name), [supported]);

  const [dsName, setDsName] = useState("");
  const [dsType, setDsType] = useState<DatasourceKind>("postgres");
  const [dsTags, setDsTags] = useState("");
  // postgres
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // mongo
  const [uri, setUri] = useState("mongodb://localhost:27017");
  const [authDatabase, setAuthDatabase] = useState("admin");
  // bigquery
  const [projectId, setProjectId] = useState("");
  const [dataset, setDataset] = useState("");
  const [credentialsFile, setCredentialsFile] = useState("");

  const [domainId, setDomainId] = useState("");
  const [domainSourceDs, setDomainSourceDs] = useState(names[0] ?? "");
  const [domainTargetDs, setDomainTargetDs] = useState(names[1] ?? names[0] ?? "");
  const [profileDomain, setProfileDomain] = useState(domains[0]?.id ?? "");
  const [profileId, setProfileId] = useState("");
  const [sourceDs, setSourceDs] = useState(names[0] ?? "");
  const [targetDs, setTargetDs] = useState(names[1] ?? names[0] ?? "");
  const [keyColumn, setKeyColumn] = useState("party_id");
  const [fields, setFields] = useState("party_name, status");
  const [sourceTable, setSourceTable] = useState("party");
  const [targetTable, setTargetTable] = useState("party");
  const [sourceQuery, setSourceQuery] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [mode, setMode] = useState("MISMATCH_DETAILS");

  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings);

  useEffect(() => {
    if (!profileDomain && domains[0]) {
      setProfileDomain(domains[0].id);
    }
  }, [domains, profileDomain]);

  useEffect(() => {
    if (names.length === 0) {
      return;
    }
    if (!names.includes(sourceDs)) {
      setSourceDs(names[0]);
    }
    if (!names.includes(targetDs)) {
      setTargetDs(names[1] ?? names[0]);
    }
    if (!names.includes(domainSourceDs)) {
      setDomainSourceDs(names[0]);
    }
    if (!names.includes(domainTargetDs)) {
      setDomainTargetDs(names[1] ?? names[0]);
    }
  }, [names, sourceDs, targetDs, domainSourceDs, domainTargetDs]);

  async function addDatasource(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    try {
      const tags = splitList(dsTags);
      const body =
        dsType === "postgres"
          ? {
              name: dsName,
              type: "postgres" as const,
              tags: tags.length ? tags : undefined,
              host,
              port: Number(port) || 5432,
              database,
              username,
              password,
            }
          : dsType === "mongo"
            ? {
                name: dsName,
                type: "mongo" as const,
                tags: tags.length ? tags : undefined,
                uri,
                database: database || undefined,
                username: username || undefined,
                password: password || undefined,
                authDatabase: authDatabase || undefined,
              }
            : {
                name: dsName,
                type: "bigquery" as const,
                tags: tags.length ? tags : undefined,
                projectId,
                dataset,
                credentialsFile: credentialsFile || undefined,
                username: username || undefined,
                password: password || undefined,
              };
      await api.createDatasource(connection, body);
      onNotice(`Datasource ${dsName} (${dsType}) registered.`);
      setDsName("");
      onRefresh();
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  async function addDomain(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    try {
      const body: {
        id: string;
        datasources?: { source?: string; target?: string };
      } = { id: domainId };
      if (domainSourceDs || domainTargetDs) {
        body.datasources = {
          ...(domainSourceDs ? { source: domainSourceDs } : {}),
          ...(domainTargetDs ? { target: domainTargetDs } : {}),
        };
      }
      await api.createDomain(connection, body);
      onNotice(`Domain ${domainId} created.`);
      setDomainId("");
      onRefresh();
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  async function addProfile(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    const fieldList = splitList(fields);
    try {
      await api.createProfile(connection, profileDomain, {
        id: profileId,
        datasources: { source: sourceDs, target: targetDs },
        migrationKey: { type: "SINGLE", columns: [keyColumn] },
        recon: { mode, conditionFields: fieldList },
        source: {
          datasource: sourceDs,
          table: sourceTable || undefined,
          fields: fieldList,
          query: sourceQuery || undefined,
        },
        target: {
          datasource: targetDs,
          table: targetTable || undefined,
          fields: fieldList,
          query: targetQuery || undefined,
        },
      });
      onNotice(`Profile ${profileDomain}.${profileId} created.`);
      setProfileId("");
      onRefresh();
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  function saveLlm(event: FormEvent) {
    event.preventDefault();
    saveLlmSettings(llm);
    onNotice(
      llmConfigured(llm)
        ? "LLM settings saved in this browser (used for run summary requests)."
        : "LLM settings cleared. Summaries need url + api key here or on the server.",
    );
  }

  return (
    <>
      <h1>Setup</h1>
      <p className="lede">
        Register <strong>Postgres</strong>, <strong>Mongo</strong>, or <strong>BigQuery</strong> datasources,
        then domains and profiles. LLM key is optional (for run summaries only).
      </p>

      <section className="card">
        <h2>Registered datasources (PG · Mongo · BigQuery)</h2>
        <div className="chips">
          {supported.map((item) => (
            <span key={item.name} className="chip">
              {item.name} · {item.type}
            </span>
          ))}
          {supported.length === 0 ? <span className="empty">None yet — add one below.</span> : null}
        </div>
      </section>

      <form className="card" onSubmit={(event) => void addDatasource(event)}>
        <h2>Add datasource</h2>
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input required placeholder="landing" value={dsName} onChange={(event) => setDsName(event.target.value)} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={dsType} onChange={(event) => setDsType(event.target.value as DatasourceKind)}>
              {DATASOURCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tags (optional)</label>
            <input placeholder="prod, party" value={dsTags} onChange={(event) => setDsTags(event.target.value)} />
          </div>
        </div>

        {dsType === "postgres" ? (
          <div className="row">
            <div className="field">
              <label>Host</label>
              <input required value={host} onChange={(event) => setHost(event.target.value)} />
            </div>
            <div className="field">
              <label>Port</label>
              <input required value={port} onChange={(event) => setPort(event.target.value)} />
            </div>
            <div className="field">
              <label>Database</label>
              <input required value={database} onChange={(event) => setDatabase(event.target.value)} />
            </div>
            <div className="field">
              <label>Username</label>
              <input required value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {dsType === "mongo" ? (
          <div className="row">
            <div className="field" style={{ flex: 1, minWidth: 280 }}>
              <label>URI</label>
              <input required value={uri} onChange={(event) => setUri(event.target.value)} />
            </div>
            <div className="field">
              <label>Database (optional)</label>
              <input value={database} onChange={(event) => setDatabase(event.target.value)} />
            </div>
            <div className="field">
              <label>Auth database</label>
              <input value={authDatabase} onChange={(event) => setAuthDatabase(event.target.value)} />
            </div>
            <div className="field">
              <label>Username (optional)</label>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label>Password (optional)</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
        ) : null}

        {dsType === "bigquery" ? (
          <div className="row">
            <div className="field">
              <label>Project id</label>
              <input required value={projectId} onChange={(event) => setProjectId(event.target.value)} />
            </div>
            <div className="field">
              <label>Dataset</label>
              <input required value={dataset} onChange={(event) => setDataset(event.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label>Credentials file (optional)</label>
              <input
                placeholder="/path/to/sa.json"
                value={credentialsFile}
                onChange={(event) => setCredentialsFile(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Username (optional)</label>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label>Password / token (optional)</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
          </div>
        ) : null}

        <button className="btn" disabled={busy || !dsName}>
          Register datasource
        </button>
      </form>

      <form className="card" onSubmit={(event) => void addDomain(event)}>
        <h2>New domain</h2>
        <p className="hint">Runs are API-triggered only — there is no schedule field.</p>
        <div className="row">
          <div className="field">
            <label>Id</label>
            <input required value={domainId} onChange={(event) => setDomainId(event.target.value)} />
          </div>
          <div className="field">
            <label>Default source (optional)</label>
            <select value={domainSourceDs} onChange={(event) => setDomainSourceDs(event.target.value)}>
              <option value="">None</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Default target (optional)</label>
            <select value={domainTargetDs} onChange={(event) => setDomainTargetDs(event.target.value)}>
              <option value="">None</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" disabled={busy}>
            Add domain
          </button>
        </div>
      </form>

      <form className="card" onSubmit={(event) => void addProfile(event)}>
        <h2>New profile (source / target = PG · Mongo · BigQuery)</h2>
        <div className="row">
          <div className="field">
            <label>Domain</label>
            <select value={profileDomain} onChange={(event) => setProfileDomain(event.target.value)}>
              {domains.length === 0 ? <option value="">No domains</option> : null}
              {domains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Profile id</label>
            <input required value={profileId} onChange={(event) => setProfileId(event.target.value)} />
          </div>
          <div className="field">
            <label>Source datasource</label>
            <select value={sourceDs} onChange={(event) => setSourceDs(event.target.value)}>
              {names.length === 0 ? <option value="">Register a datasource first</option> : null}
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target datasource</label>
            <select value={targetDs} onChange={(event) => setTargetDs(event.target.value)}>
              {names.length === 0 ? <option value="">Register a datasource first</option> : null}
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Migration key</label>
            <input value={keyColumn} onChange={(event) => setKeyColumn(event.target.value)} />
          </div>
          <div className="field">
            <label>Fields</label>
            <input value={fields} onChange={(event) => setFields(event.target.value)} />
          </div>
          <div className="field">
            <label>Source table / collection</label>
            <input value={sourceTable} onChange={(event) => setSourceTable(event.target.value)} />
          </div>
          <div className="field">
            <label>Target table / collection</label>
            <input value={targetTable} onChange={(event) => setTargetTable(event.target.value)} />
          </div>
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option>COUNTS</option>
              <option>MISMATCH_DETAILS</option>
              <option>FIELD_DETAILS</option>
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Source query (optional)</label>
            <textarea
              placeholder="SQL or Mongo JSON filter"
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Target query (optional)</label>
            <textarea
              placeholder="SQL or Mongo JSON filter"
              value={targetQuery}
              onChange={(event) => setTargetQuery(event.target.value)}
            />
          </div>
        </div>
        <button className="btn" disabled={busy || !profileDomain || names.length === 0}>
          Add profile
        </button>
      </form>

      <form className="card" onSubmit={saveLlm}>
        <h2>LLM (optional)</h2>
        <p className="hint">
          Only needed for run summaries. Saved in this browser; can also be set on the server via{" "}
          <code>DATA_RECON_LLM_URL</code> / <code>DATA_RECON_LLM_API_KEY</code>.
        </p>
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>URL</label>
            <input
              placeholder="https://api.openai.com/v1"
              value={llm.url}
              onChange={(event) => setLlm({ ...llm, url: event.target.value })}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>API key</label>
            <input
              type="password"
              placeholder="sk-…"
              value={llm.apiKey}
              onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })}
            />
          </div>
          <div className="field">
            <label>Model</label>
            <input
              placeholder="gpt-4o-mini"
              value={llm.model}
              onChange={(event) => setLlm({ ...llm, model: event.target.value })}
            />
          </div>
          <button className="btn secondary" type="submit">
            Save LLM settings
          </button>
        </div>
        <p className="field-hint">
          Status: {llmConfigured(llm) ? "ready for summary requests" : "not configured (optional)"}
        </p>
      </form>
    </>
  );
}
