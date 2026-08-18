/**
 * Agentic surface only. Operator UI must not import status/metrics tools from here.
 * Future MCP server (planned): profile status, enquire metrics, match status.
 */
export { runAgent, filterCatalog } from "./agent";
export type { AgentAction, AgentReply } from "./agent";
export { AgentPage } from "./AgentPage";
