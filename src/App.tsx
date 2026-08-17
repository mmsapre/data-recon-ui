import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, loadConnection, saveConnection } from "./api";
import { runAgent, filterCatalog } from "./agent";
import type { AgentAction } from "./agent";
import type { Connection, Datasource, Domain, Page, RecRecord, Run } from "./types";

const PAGES: { id: Page; label: string }[] = [
  { id: "catalog", label: "Catalog" },
  { id: "run", label: "Run recon" },
  { id: "results", label: "Results" },
  { id: "setup", label: "Setup" },
  { id: "agent", label: "Agent" },
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
  const [busy, setBusy] = useState(false);

  const domain = domains.find((item) => item.id === domainId);
  const profiles = domain?.profiles ?? [];

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
      setNotice("Connected to Data Recon.");
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
        <p className="tagline">Streamlit-style console</p>
        <nav className="nav">
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
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
            onOpen={(nextDomain, nextProfile) => {
              setDomainId(nextDomain);
              setProfileId(nextProfile);
              setPage("run");
            }}
          />
        ) : null}
        {page === "run" ? (
          <RunPage
            connection={connection}
            domains={domains}
            domainId={domainId}
            profileId={profileId}
            busy={busy}
            onDomain={setDomainId}
            onProfile={setProfileId}
            onBusy={setBusy}
            onError={setError}
            onNotice={setNotice}
          />
        ) : null}
        {page === "results" ? (
          <ResultsPage
            connection={connection}
            domains={domains}
            domainId={domainId}
            profileId={profileId}
            onDomain={setDomainId}
            onProfile={setProfileId}
            onError={setError}
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
        {page === "agent" ? (
          <AgentPage
            connection={connection}
            domains={domains}
            connected={connected}
            onRefresh={() => void refresh()}
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
  onOpen,
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
  onOpen: (domainId: string, profileId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [attachDomain, setAttachDomain] = useState("");
  const [attachProfile, setAttachProfile] = useState("");
  const [sourceDs, setSourceDs] = useState("");
  const [targetDs, setTargetDs] = useState("");
  const names = datasources.map((item) => item.name);
  const filtered = filterCatalog(domains, query);
  const attachProfiles = domains.find((item) => item.id === attachDomain)?.profiles ?? [];

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

  if (!connected) {
    return (
      <>
        <h1>Catalog</h1>
        <p className="lede">Connect in the sidebar to load named datasources, domains, and profiles.</p>
      </>
    );
  }
  return (
    <>
      <h1>Catalog</h1>
      <p className="lede">Search domains and profiles, then attach named datasources to a pairing.</p>
      <div className="row">
        <div className="field" style={{ minWidth: 280, flex: 1 }}>
          <label>Search domains and profiles</label>
          <input
            placeholder="party, pg-csv, mongo…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="chips">
        {datasources.map((item) => (
          <span key={item.name} className="chip">
            {item.name} · {item.type}
          </span>
        ))}
        {datasources.length === 0 ? <span className="empty">No datasources.</span> : null}
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
      {filtered.map((domain) => (
        <section key={domain.id} className="card">
          <h2>
            {domain.id}
            {domain.schedule ? ` · ${domain.schedule}` : ""}
          </h2>
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
              {domain.profiles.map((profile) => (
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
                      onClick={() => onOpen(domain.id, profile.profileId)}
                    >
                      Run
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

function RunPage({
  connection,
  domains,
  domainId,
  profileId,
  busy,
  onDomain,
  onProfile,
  onBusy,
  onError,
  onNotice,
}: {
  connection: Connection;
  domains: Domain[];
  domainId: string;
  profileId: string;
  busy: boolean;
  onDomain: (id: string) => void;
  onProfile: (id: string) => void;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
}) {
  const domain = domains.find((item) => item.id === domainId);
  const [scope, setScope] = useState<"domain" | "profile">("profile");
  const [mode, setMode] = useState("");
  const [fields, setFields] = useState("");
  const [search, setSearch] = useState("");
  const visible = filterCatalog(domains, search);

  async function trigger() {
    if (!domainId) {
      onError("Select a domain.");
      return;
    }
    onBusy(true);
    onError(null);
    const body = {
      mode: mode || undefined,
      conditionFields: splitList(fields),
    };
    try {
      if (scope === "domain") {
        const result = await api.runDomain(connection, domainId, body);
        onNotice(`Domain run ${result.domainRunId} accepted for ${Object.keys(result.runIds).length} profile(s).`);
      } else {
        if (!profileId) {
          throw new Error("Select a profile.");
        }
        const result = await api.runProfile(connection, domainId, profileId, body);
        onNotice(`Profile run ${result.runId} accepted for ${domainId}.${profileId}.`);
      }
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  return (
    <>
      <h1>Run recon</h1>
      <p className="lede">Trigger a domain (all profiles) or a single source/target pairing. Mode is optional.</p>
      <div className="row">
        <div className="field" style={{ minWidth: 200, flex: 1 }}>
          <label>Search</label>
          <input
            placeholder="Filter domains and profiles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField label="Domain" value={domainId} onChange={onDomain} options={visible.map((item) => item.id)} />
        <div className="field">
          <label>Scope</label>
          <select value={scope} onChange={(event) => setScope(event.target.value as "domain" | "profile")}>
            <option value="profile">One profile</option>
            <option value="domain">Whole domain</option>
          </select>
        </div>
        {scope === "profile" ? (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={onProfile}
            options={
              (visible.find((item) => item.id === domainId) ?? domain)?.profiles.map((item) => item.profileId) ?? []
            }
          />
        ) : null}
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
        <button className="btn" disabled={busy} onClick={() => void trigger()}>
          Run
        </button>
      </div>
    </>
  );
}

function ResultsPage({
  connection,
  domains,
  domainId,
  profileId,
  onDomain,
  onProfile,
  onError,
}: {
  connection: Connection;
  domains: Domain[];
  domainId: string;
  profileId: string;
  onDomain: (id: string) => void;
  onProfile: (id: string) => void;
  onError: (value: string | null) => void;
}) {
  const domain = domains.find((item) => item.id === domainId);
  const [activeOnly, setActiveOnly] = useState(true);
  const [scope, setScope] = useState<"domain" | "profile">("profile");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<RecRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!domainId) {
      setRuns([]);
      setSelected(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      onError(null);
      try {
        const list =
          scope === "domain"
            ? await api.domainRuns(connection, domainId, activeOnly || undefined)
            : profileId
              ? await api.profileRuns(connection, domainId, profileId, activeOnly || undefined)
              : [];
        if (cancelled) {
          return;
        }
        const profileRuns = list.filter((run) => run.profileId);
        setRuns(profileRuns);
        setSelected(profileRuns[0] ?? null);
      } catch (err) {
        if (!cancelled) {
          onError(message(err));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [domainId, profileId, scope, activeOnly, connection, onError, reloadToken]);

  useEffect(() => {
    if (!selected) {
      setRecords([]);
      return;
    }
    void api
      .records(connection, selected.id, status || undefined)
      .then(setRecords)
      .catch((err) => onError(message(err)));
  }, [selected, status, connection, onError]);

  const selectedRun = selected;

  return (
    <>
      <h1>Results</h1>
      <p className="lede">Stored run counts and per-key hashes. Business values are never shown.</p>
      <div className="row">
        <SelectField label="Domain" value={domainId} onChange={onDomain} options={domains.map((item) => item.id)} />
        <div className="field">
          <label>Scope</label>
          <select value={scope} onChange={(event) => setScope(event.target.value as "domain" | "profile")}>
            <option value="profile">One profile</option>
            <option value="domain">Whole domain</option>
          </select>
        </div>
        {scope === "profile" ? (
          <SelectField
            label="Profile"
            value={profileId}
            onChange={onProfile}
            options={domain?.profiles.map((item) => item.profileId) ?? []}
          />
        ) : null}
        <div className="field">
          <label>Active only</label>
          <select value={activeOnly ? "yes" : "no"} onChange={(event) => setActiveOnly(event.target.value === "yes")}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <button className="btn secondary" onClick={() => setReloadToken((value) => value + 1)}>
          Reload
        </button>
      </div>
      {selectedRun ? (
        <div className="metrics">
          <Metric label="Source" value={selectedRun.sourceCount} />
          <Metric label="Target" value={selectedRun.targetCount} />
          <Metric label="Matched" value={selectedRun.matchedCount} tone="ok" />
          <Metric label="Mismatched" value={selectedRun.mismatchedCount} tone="bad" />
          <Metric label="Source only" value={selectedRun.sourceOnlyCount} />
          <Metric label="Target only" value={selectedRun.targetOnlyCount} />
        </div>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Profile</th>
            <th>Status</th>
            <th>Mode</th>
            <th>Active</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.id}
              className={`clickable${selectedRun?.id === run.id ? " selected" : ""}`}
              onClick={() => setSelected(run)}
            >
              <td>{run.id}</td>
              <td>{run.profileId}</td>
              <td className={`status ${run.status}`}>{run.status}</td>
              <td>{run.reconMode}</td>
              <td>{run.active ? "yes" : ""}</td>
              <td>{formatTime(run.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 ? <p className="empty">No runs yet.</p> : null}
      {selectedRun?.sourceQuery || selectedRun?.targetQuery ? (
        <div className="row" style={{ marginTop: "1rem" }}>
          {selectedRun.sourceQuery ? (
            <div className="field" style={{ flex: 1 }}>
              <label>Source query</label>
              <pre className="query">{selectedRun.sourceQuery}</pre>
            </div>
          ) : null}
          {selectedRun.targetQuery ? (
            <div className="field" style={{ flex: 1 }}>
              <label>Target query</label>
              <pre className="query">{selectedRun.targetQuery}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
      {selectedRun ? (
        <>
          <div className="row" style={{ marginTop: "1rem" }}>
            <div className="field">
              <label>Record status</label>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All stored rows</option>
                <option value="MISMATCHED">MISMATCHED</option>
                <option value="SOURCE_ONLY">SOURCE_ONLY</option>
                <option value="TARGET_ONLY">TARGET_ONLY</option>
              </select>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>MigrationKey</th>
                <th>Status</th>
                <th>Source hash</th>
                <th>Target hash</th>
                <th>Field diffs</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.migrationKey}>
                  <td className="mono">{record.migrationKey}</td>
                  <td className={`status ${record.status}`}>{record.status}</td>
                  <td className="mono">{record.sourceHash}</td>
                  <td className="mono">{record.targetHash}</td>
                  <td className="mono">{record.fieldDiffs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 ? <p className="empty">No detail rows for this filter (COUNTS runs store none).</p> : null}
        </>
      ) : null}
    </>
  );
}

function SetupPage({
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
  const names = useMemo(() => datasources.map((item) => item.name), [datasources]);
  const [domainId, setDomainId] = useState("");
  const [schedule, setSchedule] = useState("");
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

  useEffect(() => {
    if (!profileDomain && domains[0]) {
      setProfileDomain(domains[0].id);
    }
  }, [domains, profileDomain]);

  async function addDomain(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    try {
      await api.createDomain(connection, { id: domainId, schedule: schedule || undefined });
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

  return (
    <>
      <h1>Setup</h1>
      <p className="lede">
        Add an in-memory domain or profile. Datasource names must already exist in YAML. Restart of
        Data Recon drops API-added catalog entries.
      </p>
      <form className="card" onSubmit={(event) => void addDomain(event)}>
        <h2>New domain</h2>
        <div className="row">
          <div className="field">
            <label>Id</label>
            <input required value={domainId} onChange={(event) => setDomainId(event.target.value)} />
          </div>
          <div className="field">
            <label>Schedule</label>
            <input placeholder="1h" value={schedule} onChange={(event) => setSchedule(event.target.value)} />
          </div>
          <button className="btn" disabled={busy}>
            Add domain
          </button>
        </div>
      </form>
      <form className="card" onSubmit={(event) => void addProfile(event)}>
        <h2>New profile</h2>
        <div className="row">
          <SelectField label="Domain" value={profileDomain} onChange={setProfileDomain} options={domains.map((item) => item.id)} />
          <div className="field">
            <label>Profile id</label>
            <input required value={profileId} onChange={(event) => setProfileId(event.target.value)} />
          </div>
          <SelectField label="Source datasource" value={sourceDs} onChange={setSourceDs} options={names} />
          <SelectField label="Target datasource" value={targetDs} onChange={setTargetDs} options={names} />
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
            <label>Source table</label>
            <input value={sourceTable} onChange={(event) => setSourceTable(event.target.value)} />
          </div>
          <div className="field">
            <label>Target table</label>
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
              placeholder='SELECT id AS "MigrationKey", name FROM landing.party'
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Target query (optional)</label>
            <textarea
              placeholder='{} or SQL'
              value={targetQuery}
              onChange={(event) => setTargetQuery(event.target.value)}
            />
          </div>
        </div>
        <button className="btn" disabled={busy}>
          Add profile
        </button>
      </form>
    </>
  );
}

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  reasoning?: string[];
  actions?: AgentAction[];
};

function AgentPage({
  connection,
  domains,
  connected,
  onRefresh,
}: {
  connection: Connection;
  domains: Domain[];
  connected: boolean;
  onRefresh: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      text: "Ask me to search, attach a datasource, or trigger a recon. I will show the reasoning before I call Data Recon.",
      reasoning: [
        "This tab is a small tool-using agent over the Data Recon API.",
        "Examples: “search pg-csv”, “attach landing and mongo to party pg-mongo”, “run party pg-pg COUNTS”.",
      ],
    },
  ]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const utterance = input.trim();
    if (!utterance || busy) {
      return;
    }
    setInput("");
    setMessages((current) => [...current, { role: "user", text: utterance }]);
    setBusy(true);
    try {
      const reply = await runAgent(connection, domains, utterance);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: reply.text,
          reasoning: reply.reasoning,
          actions: reply.actions,
        },
      ]);
      if (reply.actions.some((action) => action.name !== "search")) {
        onRefresh();
      }
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: message(err),
          reasoning: ["The API call failed after the plan was built."],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <>
        <h1>Agent</h1>
        <p className="lede">Connect first so the agent can see domains and trigger runs.</p>
      </>
    );
  }

  return (
    <div className="chat-page">
      <h1>Agent</h1>
      <p className="lede">Chat to search, attach datasources, and trigger recon. Reasoning is shown on every reply.</p>
      <div className="chat-log">
        {messages.map((item, index) => (
          <article key={index} className={`bubble ${item.role}`}>
            <div className="bubble-role">{item.role === "user" ? "You" : "Agent"}</div>
            {item.reasoning && item.reasoning.length > 0 ? (
              <details className="reasoning" open>
                <summary>Reasoning</summary>
                <ol>
                  {item.reasoning.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
              </details>
            ) : null}
            {item.actions && item.actions.length > 0 ? (
              <div className="actions">
                {item.actions.map((action, actionIndex) => (
                  <span key={actionIndex} className="chip">
                    {action.name}: {action.detail}
                  </span>
                ))}
              </div>
            ) : null}
            <pre className="bubble-text">{item.text}</pre>
          </article>
        ))}
        {busy ? <div className="bubble assistant">Planning and calling Data Recon…</div> : null}
      </div>
      <form className="chat-input" onSubmit={(event) => void send(event)}>
        <input
          value={input}
          placeholder="run party pg-pg · search csv · attach landing and bq to party pg-bigquery"
          onChange={(event) => setInput(event.target.value)}
        />
        <button className="btn" disabled={busy}>
          Send
        </button>
      </form>
    </div>
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

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatTime(value: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
