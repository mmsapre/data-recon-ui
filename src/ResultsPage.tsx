import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ProfileTrendChart } from "./ProfileTrendChart";
import type { Connection, Domain, RecRecord, Run } from "./types";
import { downloadCsv, formatTime, message } from "./utils";

export function ResultsPage({
  connection,
  domains,
  connected,
  focusRunId,
  initialDomainId,
  initialProfileId,
  onError,
  onClearFocus,
}: {
  connection: Connection;
  domains: Domain[];
  connected: boolean;
  focusRunId: number | null;
  initialDomainId?: string;
  initialProfileId?: string;
  onError: (value: string | null) => void;
  onClearFocus: () => void;
}) {
  const [filterDomain, setFilterDomain] = useState(initialDomainId ?? "");
  const [filterProfile, setFilterProfile] = useState(initialProfileId ?? "");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [recordStatus, setRecordStatus] = useState("MISMATCHED");
  const [records, setRecords] = useState<RecRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (initialDomainId) {
      setFilterDomain(initialDomainId);
    }
    if (initialProfileId) {
      setFilterProfile(initialProfileId);
    }
  }, [initialDomainId, initialProfileId]);

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
  const profileOptions = domain?.profiles ?? [];

  const historical = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs
      .filter((run) => run.profileId)
      .filter((run) => {
        if (filterDomain && run.domainId !== filterDomain) {
          return false;
        }
        if (filterProfile && run.profileId !== filterProfile) {
          return false;
        }
        if (activeOnly && !run.active) {
          return false;
        }
        if (runStatus && run.status !== runStatus) {
          return false;
        }
        if (!needle) {
          return true;
        }
        return [String(run.id), run.domainId, run.profileId, run.status, run.runScope]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const ta = new Date(a.completedAt || a.startedAt).getTime();
        const tb = new Date(b.completedAt || b.startedAt).getTime();
        return tb - ta;
      });
  }, [runs, filterDomain, filterProfile, activeOnly, runStatus, query]);

  const chartRuns = useMemo(() => {
    if (!filterDomain || !filterProfile) {
      return [];
    }
    return runs
      .filter((run) => run.domainId === filterDomain && run.profileId === filterProfile)
      .sort((a, b) => {
        const ta = new Date(a.completedAt || a.startedAt).getTime();
        const tb = new Date(b.completedAt || b.startedAt).getTime();
        return ta - tb;
      });
  }, [runs, filterDomain, filterProfile]);

  const activeProfiles = useMemo(
    () =>
      runs.filter((run) => {
        if (!run.active || !run.profileId) {
          return false;
        }
        if (filterDomain && run.domainId !== filterDomain) {
          return false;
        }
        if (filterProfile && run.profileId !== filterProfile) {
          return false;
        }
        return true;
      }),
    [runs, filterDomain, filterProfile],
  );

  useEffect(() => {
    if (focusRunId) {
      const focused = runs.find((run) => run.id === focusRunId);
      if (focused) {
        setSelected(focused);
        if (focused.profileId) {
          setFilterDomain(focused.domainId);
          setFilterProfile(focused.profileId);
          setRecordStatus("MISMATCHED");
        }
      }
      return;
    }
    if (historical.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((current) => {
      if (current && historical.some((run) => run.id === current.id)) {
        return historical.find((run) => run.id === current.id) ?? current;
      }
      return historical[0];
    });
  }, [historical, focusRunId, runs]);

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

  function pickRun(run: Run) {
    setSelected(run);
    setRecordStatus("MISMATCHED");
    if (run.domainId) {
      setFilterDomain(run.domainId);
    }
    if (run.profileId) {
      setFilterProfile(run.profileId);
    }
    if (focusRunId && run.id !== focusRunId) {
      onClearFocus();
    }
  }

  function exportRunsCsv() {
    downloadCsv(
      `recon-runs-${filterDomain || "all"}-${filterProfile || "all"}.csv`,
      [
        "id",
        "domainId",
        "profileId",
        "status",
        "runScope",
        "baselineRunId",
        "matchedCount",
        "mismatchedCount",
        "sourceOnlyCount",
        "targetOnlyCount",
        "sourceCount",
        "targetCount",
        "startedAt",
        "completedAt",
        "active",
        "reconMode",
      ],
      historical.map((run) => [
        run.id,
        run.domainId,
        run.profileId,
        run.status,
        run.runScope,
        run.baselineRunId,
        run.matchedCount,
        run.mismatchedCount,
        run.sourceOnlyCount,
        run.targetOnlyCount,
        run.sourceCount,
        run.targetCount,
        run.startedAt,
        run.completedAt,
        run.active ? "yes" : "no",
        run.reconMode,
      ]),
    );
  }

  function exportMismatchesCsv() {
    if (!selected) {
      return;
    }
    downloadCsv(
      `recon-run-${selected.id}-${recordStatus || "records"}.csv`,
      ["migrationKey", "status", "sourceHash", "targetHash", "fieldDiffs", "sourcePayload", "targetPayload"],
      records.map((record) => [
        record.migrationKey,
        record.status,
        record.sourceHash,
        record.targetHash,
        record.fieldDiffs,
        record.sourcePayload,
        record.targetPayload,
      ]),
    );
  }

  if (!connected) {
    return (
      <>
        <h1>Audit & status</h1>
        <p className="lede">Connect to load domains/profiles from the API and run history from the recon DB.</p>
      </>
    );
  }

  return (
    <>
      <h1>Audit & status</h1>
      <p className="lede">
        Pick domain and profile from the API catalog. Historical rows show mismatches for the selected run.
        Chart shows match / mismatch trend over time for that profile. Export CSV anytime.
      </p>

      <div className="row">
        <div className="field">
          <label>Domain (API)</label>
          <select
            value={filterDomain}
            onChange={(event) => {
              setFilterDomain(event.target.value);
              const next = domains.find((item) => item.id === event.target.value);
              setFilterProfile(next?.profiles[0]?.profileId ?? "");
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
          <label>Profile (API)</label>
          <select
            value={filterProfile}
            onChange={(event) => {
              setFilterProfile(event.target.value);
              onClearFocus();
            }}
            disabled={!filterDomain}
          >
            <option value="">{filterDomain ? "All profiles" : "Select domain first"}</option>
            {profileOptions.map((item) => (
              <option key={item.profileId} value={item.profileId}>
                {item.profileId}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 180, flex: 1 }}>
          <label>Search history</label>
          <input
            placeholder="run id, status, scope…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
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
          <label>Latest only</label>
          <select value={activeOnly ? "yes" : "no"} onChange={(event) => setActiveOnly(event.target.value === "yes")}>
            <option value="no">All history</option>
            <option value="yes">Active only</option>
          </select>
        </div>
        <button className="btn secondary" onClick={() => setReloadToken((value) => value + 1)}>
          Reload
        </button>
        <button className="btn secondary" onClick={exportRunsCsv} disabled={historical.length === 0}>
          Export runs CSV
        </button>
      </div>

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

      {filterDomain && filterProfile ? (
        <ProfileTrendChart runs={chartRuns} profileLabel={`${filterDomain}.${filterProfile}`} />
      ) : (
        <p className="empty">Select a domain and profile to see the time-based metrics graph.</p>
      )}

      <h2 className="section-title">Historical profile runs</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Domain</th>
              <th>Profile</th>
              <th>Status</th>
              <th>Scope</th>
              <th>Baseline</th>
              <th>Match</th>
              <th>Mismatch</th>
              <th>Src only</th>
              <th>Tgt only</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {historical.map((run) => (
              <tr
                key={run.id}
                className={`clickable${selected?.id === run.id ? " selected" : ""}`}
                onClick={() => pickRun(run)}
              >
                <td>{run.id}</td>
                <td>{run.domainId}</td>
                <td>{run.profileId}</td>
                <td className={`status ${run.status}`}>{run.status}</td>
                <td>
                  <span className={`scope ${(run.runScope ?? "").toLowerCase()}`}>{run.runScope ?? "—"}</span>
                </td>
                <td>{run.baselineRunId ?? "—"}</td>
                <td>{run.matchedCount}</td>
                <td className={run.mismatchedCount ? "status MISMATCHED" : ""}>{run.mismatchedCount}</td>
                <td>{run.sourceOnlyCount}</td>
                <td>{run.targetOnlyCount}</td>
                <td>{formatTime(run.startedAt)}</td>
                <td>{formatTime(run.completedAt)}</td>
                <td>{run.active ? "yes" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {historical.length === 0 ? <p className="empty">No historical profile runs for this filter.</p> : null}

      {selected?.profileId ? (
        <>
          <div className="card-head" style={{ marginTop: "1rem" }}>
            <h2 className="section-title" style={{ margin: 0 }}>
              Mismatches · {selected.domainId}.{selected.profileId} · run {selected.id}
            </h2>
            <button className="btn secondary" onClick={exportMismatchesCsv} disabled={records.length === 0}>
              Export mismatches CSV
            </button>
          </div>
          {selected.errorMessage ? <div className="banner error">{selected.errorMessage}</div> : null}
          <div className="metrics">
            <Metric label="Matched" value={selected.matchedCount} tone="ok" />
            <Metric label="Mismatched" value={selected.mismatchedCount} tone="bad" />
            <Metric label="Source only" value={selected.sourceOnlyCount} />
            <Metric label="Target only" value={selected.targetOnlyCount} />
          </div>
          <div className="chips">
            <span className="chip">Scope: {selected.runScope ?? "—"}</span>
            <span className="chip">Baseline: {selected.baselineRunId ?? "—"}</span>
            <span className="chip">Mode: {selected.reconMode ?? "—"}</span>
          </div>
          <div className="row">
            <div className="field">
              <label>Record status</label>
              <select value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
                <option value="MISMATCHED">MISMATCHED</option>
                <option value="SOURCE_ONLY">SOURCE_ONLY</option>
                <option value="TARGET_ONLY">TARGET_ONLY</option>
                <option value="MATCHED">MATCHED</option>
                <option value="">All stored rows</option>
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
            <p className="empty">No rows for this filter (COUNTS runs store none; try another status).</p>
          ) : null}
        </>
      ) : (
        <p className="empty">Select a historical profile run to inspect mismatches.</p>
      )}
    </>
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
