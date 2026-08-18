import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, loadConnection, saveConnection, selectEnv, updateCurrentUrls } from "./api";
import { AgentPage, filterCatalog } from "./agentic";
import { ENVS } from "./config";
import type {
  Connection,
  Datasource,
  Domain,
  EnvName,
  Page,
  RecRecord,
  ReconRunBody,
  Run,
  TriggerFocus,
} from "./types";

/** Operator console pages. Agentic is separate (MCP will own status/metrics for agents). */
const OPERATOR_PAGES: { id: Page; label: string }[] = [
  { id: "catalog", label: "Search & run" },
  { id: "run", label: "Run recon" },
  { id: "results", label: "Audit & status" },
  { id: "setup", label: "Setup" },
];

const AGENTIC_PAGES: { id: Page; label: string }[] = [
  { id: "agentic", label: "Agentic (separate)" },
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
        `Connected to ${connection.env.toUpperCase()} backend ${connection.backendUrl || "/api"}. Agent: ${
          connection.agentUrl?.trim() || "local tools on backend"
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
          <div className="nav-group">Agentic · MCP later</div>
          {AGENTIC_PAGES.map((item) => (
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
          <label>Agent URL</label>
          <input
            className="url"
            placeholder="optional separate agent"
            value={connection.agentUrl}
            onChange={(event) => {
              setConnection(updateCurrentUrls(connection, { agentUrl: event.target.value }));
            }}
          />
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
        <p className="lede">Connect in the sidebar, then search a domain or profile and trigger recon.</p>
      </>
    );
  }
  return (
    <>
      <h1>Search & run</h1>
      <p className="lede">
        Search domains and profiles, then trigger. Default is incremental when a prior active run
        exists; check Force full for a FULL compare. Audit opens on the new run.
      </p>
      <div className="row">
        <div className="field" style={{ minWidth: 280, flex: 1 }}>
          <label>Search domains and profiles</label>
          <input
            placeholder="party, pg-csv, mongo, tag…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
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
            <option value="incremental">Incremental (default)</option>
            <option value="full">Force full</option>
          </select>
        </div>
      </div>
      <div className="chips">
        {datasources.map((item) => (
          <span key={item.name} className="chip">
            {item.name} · {item.type}
            {(item.tags ?? []).length ? ` · ${(item.tags ?? []).join(",")}` : ""}
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
  onTriggered,
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
  onTriggered: (focus: TriggerFocus) => void;
}) {
  const domain = domains.find((item) => item.id === domainId);
  const [scope, setScope] = useState<"domain" | "profile">("profile");
  const [mode, setMode] = useState("");
  const [fields, setFields] = useState("");
  const [forceFull, setForceFull] = useState(false);
  const [search, setSearch] = useState("");
  const visible = filterCatalog(domains, search);

  async function trigger() {
    if (!domainId) {
      onError("Select a domain.");
      return;
    }
    onBusy(true);
    onError(null);
    const body = runBody(mode, fields, forceFull);
    try {
      if (scope === "domain") {
        const result = await api.runDomain(connection, domainId, body);
        onNotice(`Domain run ${result.domainRunId} accepted for ${Object.keys(result.runIds).length} profile(s).`);
        onTriggered({ domainId, runId: result.domainRunId });
      } else {
        if (!profileId) {
          throw new Error("Select a profile.");
        }
        const result = await api.runProfile(connection, domainId, profileId, body);
        onNotice(`Profile run ${result.runId} accepted for ${domainId}.${profileId}.`);
        onTriggered({ domainId, profileId, runId: result.runId });
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
      <p className="lede">
        Trigger a domain or profile. Incremental is the default; Force full compares everything.
        Open Audit & status for metrics and match counts.
      </p>
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
        <div className="field">
          <label>Run scope</label>
          <select
            value={forceFull ? "full" : "incremental"}
            onChange={(event) => setForceFull(event.target.value === "full")}
          >
            <option value="incremental">Incremental (default)</option>
            <option value="full">Force full</option>
          </select>
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
  connected,
  focusRunId,
  onError,
  onClearFocus,
}: {
  connection: Connection;
  domains: Domain[];
  connected: boolean;
  focusRunId: number | null;
  onError: (value: string | null) => void;
  onClearFocus: () => void;
}) {
  const [filterDomain, setFilterDomain] = useState("");
  const [filterProfile, setFilterProfile] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "domain" | "profile">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [runScopeFilter, setRunScopeFilter] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [recordStatus, setRecordStatus] = useState("");
  const [records, setRecords] = useState<RecRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!connected) {
      setRuns([]);
      setSelected(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      onError(null);
      try {
        const list = await api.runs(connection);
        if (cancelled) {
          return;
        }
        setRuns(list);
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
  }, [connected, connection, onError, reloadToken]);

  const domain = domains.find((item) => item.id === filterDomain);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (filterDomain && run.domainId !== filterDomain) {
        return false;
      }
      if (filterProfile && run.profileId !== filterProfile) {
        return false;
      }
      if (kind === "domain" && run.profileId) {
        return false;
      }
      if (kind === "profile" && !run.profileId) {
        return false;
      }
      if (activeOnly && !run.active) {
        return false;
      }
      if (runStatus && run.status !== runStatus) {
        return false;
      }
      if (runScopeFilter && (run.runScope ?? "") !== runScopeFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [
        String(run.id),
        run.domainId,
        run.profileId,
        run.status,
        run.reconMode,
        run.runScope,
        String(run.domainRunId ?? ""),
        String(run.baselineRunId ?? ""),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [runs, filterDomain, filterProfile, kind, activeOnly, runStatus, runScopeFilter, query]);

  useEffect(() => {
    if (focusRunId) {
      const focused = runs.find((run) => run.id === focusRunId) ?? filtered.find((run) => run.id === focusRunId);
      if (focused) {
        setSelected(focused);
      }
      return;
    }
    if (filtered.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((current) => {
      if (current && filtered.some((run) => run.id === current.id)) {
        return filtered.find((run) => run.id === current.id) ?? current;
      }
      return filtered[0];
    });
  }, [filtered, focusRunId, runs]);

  useEffect(() => {
    if (!selected || !selected.profileId) {
      setRecords([]);
      return;
    }
    void api
      .records(connection, selected.id, recordStatus || undefined)
      .then(setRecords)
      .catch((err) => onError(message(err)));
  }, [selected, recordStatus, connection, onError]);

  useEffect(() => {
    if (!runs.some((run) => run.status === "RUNNING")) {
      return;
    }
    const timer = window.setInterval(() => setReloadToken((value) => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, [runs]);

  const profileTotals = filtered.filter((run) => run.profileId);
  const activeProfiles = useMemo(
    () => runs.filter((run) => run.active && run.profileId),
    [runs],
  );
  const childRuns = selected && !selected.profileId
    ? runs.filter((run) => run.domainRunId === selected.id && run.profileId)
    : [];

  function pickRun(run: Run) {
    setSelected(run);
    if (focusRunId && run.id !== focusRunId) {
      onClearFocus();
    }
  }

  if (!connected) {
    return (
      <>
        <h1>Audit & status</h1>
        <p className="lede">Connect in the sidebar to load profile status, metrics, and match counts.</p>
      </>
    );
  }

  return (
    <>
      <h1>Audit & status</h1>
      <p className="lede">
        Operator view of profile status, run metrics, and match / mismatch counts. Agentic chat does
        not own this; a future MCP server will expose the same enquiry for agents.
      </p>
      <h2 className="section-title">Active profile status</h2>
      <div className="metrics">
        <Metric label="Active profiles" value={activeProfiles.length} />
        <Metric
          label="Matched"
          value={activeProfiles.reduce((sum, run) => sum + (run.matchedCount ?? 0), 0)}
          tone="ok"
        />
        <Metric
          label="Mismatched"
          value={activeProfiles.reduce((sum, run) => sum + (run.mismatchedCount ?? 0), 0)}
          tone="bad"
        />
        <Metric
          label="Source only"
          value={activeProfiles.reduce((sum, run) => sum + (run.sourceOnlyCount ?? 0), 0)}
        />
        <Metric
          label="Target only"
          value={activeProfiles.reduce((sum, run) => sum + (run.targetOnlyCount ?? 0), 0)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Profile</th>
              <th>Run</th>
              <th>Status</th>
              <th>Scope</th>
              <th>Baseline</th>
              <th>Mode</th>
              <th>Match</th>
              <th>Mismatch</th>
              <th>Src only</th>
              <th>Tgt only</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {activeProfiles.map((run) => (
              <tr
                key={run.id}
                className={`clickable${selected?.id === run.id ? " selected" : ""}`}
                onClick={() => pickRun(run)}
              >
                <td>{run.domainId}</td>
                <td>{run.profileId}</td>
                <td>{run.id}</td>
                <td className={`status ${run.status}`}>{run.status}</td>
                <td>
                  <span className={`scope ${(run.runScope ?? "").toLowerCase()}`}>
                    {run.runScope ?? "—"}
                  </span>
                </td>
                <td>{run.baselineRunId ?? "—"}</td>
                <td>{run.reconMode}</td>
                <td>{run.matchedCount}</td>
                <td className={run.mismatchedCount ? "status MISMATCHED" : ""}>{run.mismatchedCount}</td>
                <td>{run.sourceOnlyCount}</td>
                <td>{run.targetOnlyCount}</td>
                <td>{formatTime(run.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {activeProfiles.length === 0 ? <p className="empty">No active profile runs yet.</p> : null}
      <h2 className="section-title">Run history</h2>
      <div className="row">
        <div className="field" style={{ minWidth: 180, flex: 1 }}>
          <label>Search runs</label>
          <input
            placeholder="run id, domain, profile, status, scope…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label>Domain</label>
          <select
            value={filterDomain}
            onChange={(event) => {
              setFilterDomain(event.target.value);
              setFilterProfile("");
              onClearFocus();
            }}
          >
            <option value="">All domains</option>
            {domains.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Profile</label>
          <select
            value={filterProfile}
            onChange={(event) => {
              setFilterProfile(event.target.value);
              onClearFocus();
            }}
            disabled={!filterDomain}
          >
            <option value="">All profiles</option>
            {(domain?.profiles ?? []).map((item) => (
              <option key={item.profileId} value={item.profileId}>
                {item.profileId}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Kind</label>
          <select value={kind} onChange={(event) => setKind(event.target.value as "all" | "domain" | "profile")}>
            <option value="all">Domain + profile</option>
            <option value="domain">Domain runs</option>
            <option value="profile">Profile runs</option>
          </select>
        </div>
        <div className="field">
          <label>Run status</label>
          <select value={runStatus} onChange={(event) => setRunStatus(event.target.value)}>
            <option value="">All</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
        <div className="field">
          <label>Scope</label>
          <select value={runScopeFilter} onChange={(event) => setRunScopeFilter(event.target.value)}>
            <option value="">All</option>
            <option value="FULL">FULL</option>
            <option value="INCREMENTAL">INCREMENTAL</option>
          </select>
        </div>
        <div className="field">
          <label>Latest only</label>
          <select value={activeOnly ? "yes" : "no"} onChange={(event) => setActiveOnly(event.target.value === "yes")}>
            <option value="no">All history</option>
            <option value="yes">Active only</option>
          </select>
        </div>
        <button className="btn secondary" onClick={() => setReloadToken((value) => value + 1)}>
          Reload
        </button>
      </div>
      <div className="metrics">
        <Metric label="Runs" value={filtered.length} />
        <Metric label="Running" value={filtered.filter((run) => run.status === "RUNNING").length} />
        <Metric label="Failed" value={filtered.filter((run) => run.status === "FAILED").length} tone="bad" />
        <Metric
          label="Mismatched keys"
          value={profileTotals.reduce((sum, run) => sum + (run.mismatchedCount ?? 0), 0)}
          tone="bad"
        />
        <Metric
          label="Matched keys"
          value={profileTotals.reduce((sum, run) => sum + (run.matchedCount ?? 0), 0)}
          tone="ok"
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Kind</th>
              <th>Domain</th>
              <th>Profile</th>
              <th>Domain run</th>
              <th>Status</th>
              <th>Scope</th>
              <th>Baseline</th>
              <th>Mode</th>
              <th>Active</th>
              <th>Src</th>
              <th>Tgt</th>
              <th>Match</th>
              <th>Mismatch</th>
              <th>Src only</th>
              <th>Tgt only</th>
              <th>Started</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run) => (
              <tr
                key={run.id}
                className={`clickable${selected?.id === run.id ? " selected" : ""}`}
                onClick={() => pickRun(run)}
              >
                <td>{run.id}</td>
                <td>{run.profileId ? "profile" : "domain"}</td>
                <td>{run.domainId}</td>
                <td>{run.profileId ?? "—"}</td>
                <td>{run.domainRunId ?? (run.profileId ? "—" : run.id)}</td>
                <td className={`status ${run.status}`}>{run.status}</td>
                <td>
                  <span className={`scope ${(run.runScope ?? "").toLowerCase()}`}>
                    {run.runScope ?? "—"}
                  </span>
                </td>
                <td>{run.baselineRunId ?? "—"}</td>
                <td>{run.reconMode}</td>
                <td>{run.active ? "yes" : ""}</td>
                <td>{run.sourceCount}</td>
                <td>{run.targetCount}</td>
                <td>{run.matchedCount}</td>
                <td className={run.mismatchedCount ? "status MISMATCHED" : ""}>{run.mismatchedCount}</td>
                <td>{run.sourceOnlyCount}</td>
                <td>{run.targetOnlyCount}</td>
                <td>{formatTime(run.startedAt)}</td>
                <td>{formatTime(run.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? <p className="empty">No runs match these filters.</p> : null}
      {selected ? (
        <>
          <h2 className="section-title">
            {selected.profileId
              ? `Profile result ${selected.domainId}.${selected.profileId} · run ${selected.id}`
              : `Domain result ${selected.domainId} · domain run ${selected.id}`}
          </h2>
          {selected.errorMessage ? <div className="banner error">{selected.errorMessage}</div> : null}
          <div className="metrics">
            <Metric label="Source" value={selected.sourceCount} />
            <Metric label="Target" value={selected.targetCount} />
            <Metric label="Matched" value={selected.matchedCount} tone="ok" />
            <Metric label="Mismatched" value={selected.mismatchedCount} tone="bad" />
            <Metric label="Source only" value={selected.sourceOnlyCount} />
            <Metric label="Target only" value={selected.targetOnlyCount} />
          </div>
          <div className="chips">
            <span className="chip">Scope: {selected.runScope ?? "—"}</span>
            <span className="chip">Baseline: {selected.baselineRunId ?? "—"}</span>
            <span className="chip">Mode: {selected.reconMode ?? "—"}</span>
            {(selected.conditionFields ?? []).length ? (
              <span className="chip">Fields: {(selected.conditionFields ?? []).join(", ")}</span>
            ) : null}
          </div>
          {selected.sourceQuery || selected.targetQuery ? (
            <div className="row">
              {selected.sourceQuery ? (
                <div className="field" style={{ flex: 1 }}>
                  <label>Source query</label>
                  <pre className="query">{selected.sourceQuery}</pre>
                </div>
              ) : null}
              {selected.targetQuery ? (
                <div className="field" style={{ flex: 1 }}>
                  <label>Target query</label>
                  <pre className="query">{selected.targetQuery}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {childRuns.length > 0 ? (
            <>
              <h3 className="section-title">Profiles in this domain run</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Profile</th>
                      <th>Status</th>
                      <th>Scope</th>
                      <th>Match</th>
                      <th>Mismatch</th>
                      <th>Src only</th>
                      <th>Tgt only</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childRuns.map((run) => (
                      <tr
                        key={run.id}
                        className="clickable"
                        onClick={() => pickRun(run)}
                      >
                        <td>{run.id}</td>
                        <td>{run.profileId}</td>
                        <td className={`status ${run.status}`}>{run.status}</td>
                        <td>{run.runScope ?? "—"}</td>
                        <td>{run.matchedCount}</td>
                        <td className={run.mismatchedCount ? "status MISMATCHED" : ""}>{run.mismatchedCount}</td>
                        <td>{run.sourceOnlyCount}</td>
                        <td>{run.targetOnlyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {selected.profileId ? (
            <>
              <div className="row">
                <div className="field">
                  <label>Record status</label>
                  <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
                    <option value="">All stored rows</option>
                    <option value="MISMATCHED">MISMATCHED</option>
                    <option value="SOURCE_ONLY">SOURCE_ONLY</option>
                    <option value="TARGET_ONLY">TARGET_ONLY</option>
                    <option value="MATCHED">MATCHED</option>
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>MigrationKey</th>
                      <th>Status</th>
                      <th>Source hash</th>
                      <th>Target hash</th>
                      <th>Field diffs</th>
                      <th>Source payload</th>
                      <th>Target payload</th>
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
                        <td className="mono payload">{record.sourcePayload ?? ""}</td>
                        <td className="mono payload">{record.targetPayload ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {records.length === 0 ? (
                <p className="empty">No detail rows for this filter (COUNTS runs store none).</p>
              ) : null}
            </>
          ) : (
            <p className="empty">Select a profile row above to inspect per-key hashes and payloads.</p>
          )}
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

function runBody(mode: string, fields: string, forceFull = false): ReconRunBody {
  const conditionFields = splitList(fields);
  return {
    mode: mode || undefined,
    conditionFields: conditionFields.length ? conditionFields : undefined,
    forceFull: forceFull || undefined,
  };
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
