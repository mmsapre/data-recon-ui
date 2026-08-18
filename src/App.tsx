import { FormEvent, useEffect, useState } from "react";
import { api, loadConnection, saveConnection, selectEnv, updateCurrentUrls } from "./api";
import { AgentPage, filterCatalog } from "./agentic";
import { ENVS } from "./config";
import { ResultsPage } from "./ResultsPage";
import { RunPage } from "./RunPage";
import { SetupPage } from "./SetupPage";
import { isSupportedDatasource } from "./setupTypes";
import type {
  Connection,
  Datasource,
  Domain,
  EnvName,
  Page,
  TriggerFocus,
} from "./types";
import { message, runBody } from "./utils";

/** Operator console pages. Agentic is separate (MCP will own status/metrics for agents). */
const OPERATOR_PAGES: { id: Page; label: string }[] = [
  { id: "catalog", label: "Search & run" },
  { id: "run", label: "Run recon" },
  { id: "results", label: "Audit & status" },
  { id: "setup", label: "Setup" },
];

const SARVAJ_TOOLTIP =
  "Sarvaj — know status of distribution tracker, consumer audit, recon metrics";

const AGENTIC_PAGES: { id: Page; label: string; title: string }[] = [
  { id: "agentic", label: "Sarvaj", title: SARVAJ_TOOLTIP },
];

export default function App() {
  const [page, setPage] = useState<Page>("catalog");
  const [connection, setConnection] = useState<Connection>(loadConnection);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [focusRunId, setFocusRunId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const domain = domains.find((item) => item.id === domainId);
  const profiles = domain?.profiles ?? [];

  function openAudit(focus: TriggerFocus) {
    setDomainId(focus.domainId);
    setProfileId(focus.profileId ?? "");
    setFocusRunId(focus.runId ?? null);
    setPage("results");
  }

  useEffect(() => {
    saveConnection(connection);
  }, [connection]);

  useEffect(() => {
    if (domain && !profiles.some((profile) => profile.profileId === profileId)) {
      setProfileId(profiles[0]?.profileId ?? "");
    }
  }, [domain, profileId, profiles]);

  async function refresh() {
    setError(null);
    const [sourceList, domainList] = await Promise.all([
      api.datasources(connection),
      api.domains(connection),
    ]);
    setDatasources(sourceList);
    setDomains(domainList);
    setConnected(true);
    if (!domainId && domainList.length > 0) {
      setDomainId(domainList[0].id);
    }
  }

  async function connect() {
    setBusy(true);
    setNotice(null);
    try {
      await refresh();
      setNotice(
        `Connected to ${connection.env.toUpperCase()} backend ${connection.backendUrl || "/api"}. Sarvaj agent: ${
          connection.agentUrl?.trim() || "blank (local tools)"
        }.`,
      );
    } catch (err) {
      setConnected(false);
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="brand">Data Recon</h1>
        <p className="tagline">Operator console</p>
        <nav className="nav">
          <div className="nav-group">Operator</div>
          {OPERATOR_PAGES.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="nav-group">Agent</div>
          {AGENTIC_PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "active" : ""}
              title={item.title}
              aria-label={item.title}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="field">
          <label>Environment</label>
          <select
            value={connection.env}
            onChange={(event) => {
              setConnection(selectEnv(connection, event.target.value as EnvName));
              setConnected(false);
            }}
          >
            {ENVS.map((name) => (
              <option key={name} value={name}>
                {name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Backend URL</label>
          <input
            className="url"
            placeholder="http://localhost:8080"
            value={connection.backendUrl}
            onChange={(event) => {
              setConnection(updateCurrentUrls(connection, { backendUrl: event.target.value }));
              setConnected(false);
            }}
          />
        </div>
        <div className="field">
          <label title={SARVAJ_TOOLTIP}>Agent URL (Sarvaj)</label>
          <input
            className="url"
            title={SARVAJ_TOOLTIP}
            placeholder="leave blank"
            value={connection.agentUrl}
            onChange={(event) => {
              setConnection(updateCurrentUrls(connection, { agentUrl: event.target.value }));
            }}
          />
          <p className="field-hint" title={SARVAJ_TOOLTIP}>
            Blank = local tools. Sarvaj: distribution tracker, consumer audit, recon metrics.
          </p>
        </div>
        <div className="field">
          <label>Username</label>
          <input
            value={connection.user}
            onChange={(event) => setConnection({ ...connection, user: event.target.value })}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={connection.password}
            onChange={(event) => setConnection({ ...connection, password: event.target.value })}
          />
        </div>
        <button className="btn" disabled={busy} onClick={() => void connect()}>
          {connected ? "Refresh" : "Connect"}
        </button>
      </aside>
      <main className="main">
        {error ? <div className="banner error">{error}</div> : null}
        {notice ? <div className="banner ok">{notice}</div> : null}
        {page === "catalog" ? (
          <CatalogPage
            connection={connection}
            datasources={datasources}
            domains={domains}
            connected={connected}
            busy={busy}
            onBusy={setBusy}
            onError={setError}
            onNotice={setNotice}
            onRefresh={() => void refresh()}
            onTriggered={openAudit}
          />
        ) : null}
        {page === "run" ? (
          <RunPage
            connection={connection}
            domains={domains}
            domainId={domainId}
            profileId={profileId}
            busy={busy}
            connected={connected}
            onDomain={setDomainId}
            onProfile={setProfileId}
            onBusy={setBusy}
            onError={setError}
            onNotice={setNotice}
            onTriggered={openAudit}
          />
        ) : null}
        {page === "results" ? (
          <ResultsPage
            connection={connection}
            domains={domains}
            connected={connected}
            focusRunId={focusRunId}
            initialDomainId={domainId}
            initialProfileId={profileId}
            onError={setError}
            onClearFocus={() => setFocusRunId(null)}
          />
        ) : null}
        {page === "setup" ? (
          <SetupPage
            connection={connection}
            datasources={datasources}
            domains={domains}
            busy={busy}
            onBusy={setBusy}
            onError={setError}
            onNotice={setNotice}
            onRefresh={() => void refresh()}
          />
        ) : null}
        {page === "agentic" ? (
          <AgentPage
            connection={connection}
            domains={domains}
            connected={connected}
            onRefresh={() => void refresh()}
            onTriggered={openAudit}
          />
        ) : null}
      </main>
    </div>
  );
}

function CatalogPage({
  connection,
  datasources,
  domains,
  connected,
  busy,
  onBusy,
  onError,
  onNotice,
  onRefresh,
  onTriggered,
}: {
  connection: Connection;
  datasources: Datasource[];
  domains: Domain[];
  connected: boolean;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  onRefresh: () => void;
  onTriggered: (focus: TriggerFocus) => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("");
  const [fields, setFields] = useState("");
  const [forceFull, setForceFull] = useState(false);
  const [runDomain, setRunDomain] = useState("");
  const [runProfile, setRunProfile] = useState("");
  const [attachDomain, setAttachDomain] = useState("");
  const [attachProfile, setAttachProfile] = useState("");
  const [sourceDs, setSourceDs] = useState("");
  const [targetDs, setTargetDs] = useState("");
  const names = datasources.filter(isSupportedDatasource).map((item) => item.name);
  const filtered = filterCatalog(domains, query);
  const attachProfiles = domains.find((item) => item.id === attachDomain)?.profiles ?? [];
  const runProfiles = domains.find((item) => item.id === runDomain)?.profiles ?? [];
  const supportedSources = datasources.filter(isSupportedDatasource);

  useEffect(() => {
    if (!runDomain && domains[0]) {
      setRunDomain(domains[0].id);
    }
  }, [domains, runDomain]);

  useEffect(() => {
    if (runProfiles.length > 0 && !runProfiles.some((item) => item.profileId === runProfile)) {
      setRunProfile(runProfiles[0].profileId);
    }
  }, [runProfiles, runProfile]);

  useEffect(() => {
    if (!attachDomain && filtered[0]) {
      setAttachDomain(filtered[0].id);
    }
  }, [attachDomain, filtered]);

  useEffect(() => {
    if (attachProfiles.length > 0 && !attachProfiles.some((item) => item.profileId === attachProfile)) {
      setAttachProfile(attachProfiles[0].profileId);
    }
  }, [attachProfiles, attachProfile]);

  useEffect(() => {
    if (!sourceDs && names[0]) {
      setSourceDs(names[0]);
    }
    if (!targetDs && (names[1] || names[0])) {
      setTargetDs(names[1] ?? names[0]);
    }
  }, [names, sourceDs, targetDs]);

  async function attach(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    try {
      const updated = await api.attachDatasources(connection, attachDomain, attachProfile, {
        source: sourceDs,
        target: targetDs,
      });
      onNotice(
        `Attached ${updated.sourceDatasource} → ${updated.targetDatasource} on ${updated.domainId}.${updated.profileId}.`,
      );
      onRefresh();
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  async function triggerDomain(id: string) {
    onBusy(true);
    onError(null);
    try {
      const result = await api.runDomain(connection, id, runBody(mode, fields, forceFull));
      onNotice(`Triggered domain ${id} (domain run ${result.domainRunId}).`);
      onTriggered({ domainId: id, runId: result.domainRunId });
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  async function triggerProfile(nextDomain: string, nextProfile: string) {
    onBusy(true);
    onError(null);
    try {
      const result = await api.runProfile(connection, nextDomain, nextProfile, runBody(mode, fields, forceFull));
      onNotice(`Triggered ${nextDomain}.${nextProfile} (run ${result.runId}).`);
      onTriggered({ domainId: nextDomain, profileId: nextProfile, runId: result.runId });
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  if (!connected) {
    return (
      <>
        <h1>Search & run</h1>
        <p className="lede">Connect so domain/profile dropdowns load from the API.</p>
      </>
    );
  }
  return (
    <>
      <h1>Search & run</h1>
      <p className="lede">
        Domains and profiles are loaded from the API. Use the dropdowns to pick one and Run, or browse
        the catalog below. Prefer <strong>Run recon</strong> for the dedicated execute form.
      </p>
      <section className="card">
        <h2>Quick run (API dropdowns)</h2>
        <div className="row">
          <div className="field">
            <label>Domain</label>
            <select
              value={runDomain}
              onChange={(event) => {
                setRunDomain(event.target.value);
                const next = domains.find((item) => item.id === event.target.value);
                setRunProfile(next?.profiles[0]?.profileId ?? "");
              }}
            >
              {domains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Profile</label>
            <select value={runProfile} onChange={(event) => setRunProfile(event.target.value)}>
              {runProfiles.map((item) => (
                <option key={item.profileId} value={item.profileId}>
                  {item.profileId}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="">Profile default</option>
              <option value="COUNTS">COUNTS</option>
              <option value="MISMATCH_DETAILS">MISMATCH_DETAILS</option>
              <option value="FIELD_DETAILS">FIELD_DETAILS</option>
            </select>
          </div>
          <div className="field">
            <label>Condition fields</label>
            <input
              placeholder="party_name, status"
              value={fields}
              onChange={(event) => setFields(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Run scope</label>
            <select
              value={forceFull ? "full" : "incremental"}
              onChange={(event) => setForceFull(event.target.value === "full")}
            >
              <option value="incremental">Incremental</option>
              <option value="full">Force full</option>
            </select>
          </div>
          <button
            className="btn"
            disabled={busy || !runDomain || !runProfile}
            onClick={() => void triggerProfile(runDomain, runProfile)}
          >
            Run profile
          </button>
          <button
            className="btn secondary"
            disabled={busy || !runDomain}
            onClick={() => void triggerDomain(runDomain)}
          >
            Run domain
          </button>
        </div>
      </section>
      <div className="row">
        <div className="field" style={{ minWidth: 280, flex: 1 }}>
          <label>Search catalog</label>
          <input
            placeholder="party, pg-csv, mongo, tag…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="chips">
        {supportedSources.map((item) => (
          <span key={item.name} className="chip">
            {item.name} · {item.type}
          </span>
        ))}
        {supportedSources.length === 0 ? <span className="empty">No Postgres / Mongo / BigQuery datasources.</span> : null}
      </div>
      <form className="card" onSubmit={(event) => void attach(event)}>
        <h2>Add datasource to a profile</h2>
        <div className="row">
          <SelectField
            label="Domain"
            value={attachDomain}
            onChange={setAttachDomain}
            options={filtered.map((item) => item.id)}
          />
          <SelectField
            label="Profile"
            value={attachProfile}
            onChange={setAttachProfile}
            options={attachProfiles.map((item) => item.profileId)}
          />
          <SelectField label="Source" value={sourceDs} onChange={setSourceDs} options={names} />
          <SelectField label="Target" value={targetDs} onChange={setTargetDs} options={names} />
          <button className="btn" disabled={busy || !attachDomain || !attachProfile}>
            Attach
          </button>
        </div>
      </form>
      {filtered.map((item) => (
        <section key={item.id} className="card">
          <div className="card-head">
            <h2>
              {item.id}
              {item.schedule ? ` · ${item.schedule}` : ""}
              {(item.tags ?? []).length ? ` · tags: ${(item.tags ?? []).join(", ")}` : ""}
            </h2>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void triggerDomain(item.id)}
            >
              Run domain
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Profile</th>
                <th>Source</th>
                <th>Target</th>
                <th>Key</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {item.profiles.map((profile) => (
                <tr key={profile.id}>
                  <td>{profile.profileId}</td>
                  <td>
                    {profile.sourceDatasource} ({profile.sourceType})
                  </td>
                  <td>
                    {profile.targetDatasource} ({profile.targetType})
                  </td>
                  <td>
                    {profile.migrationKeyType} {profile.migrationKeyColumns?.join(", ")}
                  </td>
                  <td>{profile.reconMode}</td>
                  <td>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => void triggerProfile(item.id, profile.profileId)}
                    >
                      Run profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {filtered.length === 0 ? <p className="empty">No domains or profiles matched the search.</p> : null}
    </>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 ? <option value="">None</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

