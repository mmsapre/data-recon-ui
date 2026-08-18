/**
 * Agentic chat UI — intentionally separate from the operator console.
 * Profile status, metrics, and match enquiry will be served by a future MCP server,
 * not by this page.
 */
import { FormEvent, useState } from "react";
import { runAgent } from "./agent";
import type { AgentAction } from "./agent";
import type { Connection, Domain, TriggerFocus } from "../types";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  reasoning?: string[];
  actions?: AgentAction[];
  focus?: TriggerFocus;
};

export function AgentPage({
  connection,
  domains,
  connected,
  onRefresh,
  onTriggered,
}: {
  connection: Connection;
  domains: Domain[];
  connected: boolean;
  onRefresh: () => void;
  onTriggered: (focus: TriggerFocus) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      text: "Agentic chat only: search, attach, or trigger. For profile status, metrics, and match counts use Audit (operator UI) or the planned MCP server.",
      reasoning: [
        "This tab is separate from the operator console (Search, Run, Audit, Setup).",
        "Empty Agent URL uses the local tool agent against the Backend URL.",
        "A future MCP server will answer status / metrics / match queries for agents.",
        "Search: “search csv”, “list party”, “show me pg-mongo”.",
        "Trigger: “run party pg-pg”, “run party force full”, “trigger party pg-csv COUNTS”.",
        "Attach: “attach landing and mongo to party pg-mongo”.",
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
    setMessages((current) => [
      ...current,
      { role: "user", text: utterance },
      { role: "assistant", text: "Working…", reasoning: [] },
    ]);
    setBusy(true);
    try {
      const reply = await runAgent(connection, domains, utterance, (steps) => {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, reasoning: steps };
          }
          return next;
        });
      });
      setMessages((current) => {
        const next = [...current];
        next[next.length - 1] = {
          role: "assistant",
          text: reply.text,
          reasoning: reply.reasoning,
          actions: reply.actions,
          focus: reply.focus,
        };
        return next;
      });
      if (reply.actions.some((action) => action.name !== "search")) {
        onRefresh();
      }
    } catch (err) {
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          role: "assistant",
          text: err instanceof Error ? err.message : String(err),
          reasoning: last?.reasoning?.length
            ? [...last.reasoning, "The API call failed after the plan was built."]
            : ["The API call failed after the plan was built."],
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <>
        <h1>Agentic</h1>
        <p className="lede">Connect first. This surface is separate from operator Audit/metrics.</p>
      </>
    );
  }

  return (
    <div className="chat-page">
      <h1>Agentic</h1>
      <p className="lede">
        Separate from the operator console. Chat to search, attach, or trigger. Profile status,
        metrics, and match enquiry belong in Audit now and in MCP later — not here.
      </p>
      <div className="banner ok">
        Operator metrics live under <strong>Audit</strong>. Planned MCP tools: profile status,
        run metrics, match / mismatch counts.
      </div>
      <div className="chat-log">
        {messages.map((item, index) => (
          <article key={index} className={`bubble ${item.role}`}>
            <div className="bubble-role">{item.role === "user" ? "You" : "Agent"}</div>
            {item.reasoning && item.reasoning.length > 0 ? (
              <div className="reasoning">
                <div className="reasoning-title">All reasoning</div>
                <ol>
                  {item.reasoning.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>
              </div>
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
            {item.focus?.runId ? (
              <button type="button" className="btn secondary" onClick={() => onTriggered(item.focus!)}>
                View run {item.focus.runId} in Audit
              </button>
            ) : null}
            <pre className="bubble-text">{item.text}</pre>
          </article>
        ))}
      </div>
      <form className="chat-input" onSubmit={(event) => void send(event)}>
        <input
          value={input}
          placeholder="run party pg-pg · run party force full · search csv · attach landing and bq to party pg-bigquery"
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
        <button className="btn" disabled={busy || !input.trim()}>
          {busy ? "Working…" : "Send"}
        </button>
      </form>
    </div>
  );
}
