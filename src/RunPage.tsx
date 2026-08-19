import { useState } from "react";
import { api } from "./api";
import type { Connection, Domain, TriggerFocus } from "./types";
import { message, runBody } from "./utils";

/** Trigger a recon using domain/profile dropdowns loaded from GET /api/domains. */
export function RunPage({
  connection,
  domains,
  domainId,
  profileId,
  busy,
  connected,
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
  connected: boolean;
  onDomain: (id: string) => void;
  onProfile: (id: string) => void;
  onBusy: (value: boolean) => void;
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  onTriggered: (focus: TriggerFocus) => void;
}) {
  const domain = domains.find((item) => item.id === domainId);
  const profiles = domain?.profiles ?? [];
  const [scope, setScope] = useState<"domain" | "profile">("profile");
  const [mode, setMode] = useState("");
  const [fields, setFields] = useState("");
  const [forceFull, setForceFull] = useState(false);

  async function trigger() {
    if (!domainId) {
      onError("Select a domain from the API catalog.");
      return;
    }
    onBusy(true);
    onError(null);
    const body = runBody(mode, fields, forceFull);
    try {
      if (scope === "domain") {
        const result = await api.runDomain(connection, domainId, body);
        onNotice(
          `Domain run ${result.domainRunId} accepted for ${Object.keys(result.runIds).length} profile(s).`,
        );
        onTriggered({ domainId, runId: result.domainRunId });
      } else {
        if (!profileId) {
          throw new Error("Select a profile from the API catalog.");
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

  async function triggerKind(kind: "counts" | "details") {
    if (!domainId || !profileId) {
      onError("Select a domain and profile.");
      return;
    }
    onBusy(true);
    onError(null);
    const fieldsList = fields
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const body = {
      profile: `${domainId}.${profileId}`,
      domain: domainId,
      conditionFields: fieldsList.length ? fieldsList : undefined,
      forceFull: forceFull || undefined,
    };
    try {
      const result =
        kind === "counts"
          ? await api.runProfileCounts(connection, body)
          : await api.runProfileDetails(connection, body);
      onNotice(`Triggered ${result.id} as ${result.mode} (run ${result.runId}).`);
      onTriggered({ domainId: result.domainId, profileId: result.profileId, runId: result.runId });
    } catch (err) {
      onError(message(err));
    } finally {
      onBusy(false);
    }
  }

  if (!connected) {
    return (
      <>
        <h1>Run recon</h1>
        <p className="lede">Connect so domain and profile dropdowns load from the Data Recon API.</p>
      </>
    );
  }

  return (
    <>
      <h1>Run recon</h1>
      <p className="lede">
        Domains and profiles come from <code>GET /api/domains</code>. Pick one pairing (or a whole domain),
        then Run. Audit opens afterward for mismatches and history.
      </p>
      <section className="card">
        <h2>Select and execute</h2>
        <div className="row">
          <div className="field">
            <label>Domain (from API)</label>
            <select
              value={domainId}
              onChange={(event) => {
                onDomain(event.target.value);
                const next = domains.find((item) => item.id === event.target.value);
                onProfile(next?.profiles[0]?.profileId ?? "");
              }}
            >
              {domains.length === 0 ? <option value="">No domains</option> : null}
              {domains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                  {(item.tags ?? []).length ? ` [${(item.tags ?? []).join(", ")}]` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Execute</label>
            <select value={scope} onChange={(event) => setScope(event.target.value as "domain" | "profile")}>
              <option value="profile">Selected profile</option>
              <option value="domain">Whole domain (all profiles)</option>
            </select>
          </div>
          {scope === "profile" ? (
            <div className="field">
              <label>Profile (from API)</label>
              <select value={profileId} onChange={(event) => onProfile(event.target.value)}>
                {profiles.length === 0 ? <option value="">No profiles</option> : null}
                {profiles.map((item) => (
                  <option key={item.profileId} value={item.profileId}>
                    {item.profileId} · {item.sourceDatasource} → {item.targetDatasource}
                  </option>
                ))}
              </select>
            </div>
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
          <button
            className="btn"
            disabled={busy || !domainId || (scope === "profile" && !profileId)}
            onClick={() => void trigger()}
          >
            Run
          </button>
          {scope === "profile" ? (
            <>
              <button
                className="btn secondary"
                disabled={busy || !domainId || !profileId}
                onClick={() => void triggerKind("counts")}
              >
                Run counts
              </button>
              <button
                className="btn secondary"
                disabled={busy || !domainId || !profileId}
                onClick={() => void triggerKind("details")}
              >
                Run details
              </button>
            </>
          ) : null}
        </div>
        {domain && scope === "profile" && profileId ? (
          <p className="hint">
            Path run:{" "}
            <code>
              POST /api/domains/{domainId}/profiles/{profileId}/runs
            </code>
            . Or by name/id: <code>POST /api/profiles/runs/counts|details</code> with{" "}
            <code>{`{ "profile": "${domainId}.${profileId}" }`}</code>.
          </p>
        ) : null}
        {domain && scope === "domain" ? (
          <p className="hint">
            Will call <code>POST /api/domains/{domainId}/runs</code> for {profiles.length} profile(s).
          </p>
        ) : null}
      </section>
    </>
  );
}
