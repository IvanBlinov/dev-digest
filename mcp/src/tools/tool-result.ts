import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, ApiTimeoutError, ApiUnreachableError } from '../api/errors';
import {
  AgentNotFoundError,
  AmbiguousAgentError,
  NoEnabledAgentsError,
  PrNotImportedError,
  RepoNotFoundError,
  RunNotFoundError,
} from '../domain/errors';
import { log } from '../log';
import { truncate } from '../presenters/text';

export function ok(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

export function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function messageFor(e: unknown): string | null {
  if (e instanceof RepoNotFoundError) {
    const known = e.known.length ? ` Known: ${e.known.join(', ')}.` : '';
    return `Repo ${e.requested} not found in DevDigest.${known} Add it in the DevDigest UI.`;
  }
  if (e instanceof PrNotImportedError) {
    return `PR #${e.prNumber} not found in ${e.repo} — import/sync it in the UI, then retry.`;
  }
  if (e instanceof AgentNotFoundError) {
    return `Agent "${e.requested}" not found. Available agents: ${e.names.join(', ') || 'none'}. Use list_agents.`;
  }
  if (e instanceof AmbiguousAgentError) {
    const list = e.candidates.map((c) => `${c.name} (${c.id})`).join(', ');
    return `Several agents share that name: ${list}. Pass the agent id instead.`;
  }
  if (e instanceof RunNotFoundError) {
    return `Run ${e.runId} not found for this PR — use the run_id returned by run_review.`;
  }
  if (e instanceof NoEnabledAgentsError) {
    return 'No review run was started: no agent is enabled — enable an agent in the UI, or name one.';
  }
  if (e instanceof ApiUnreachableError) {
    return `DevDigest API unreachable at ${e.url}. Start it with ./scripts/dev.sh or set DEVDIGEST_API_URL.`;
  }
  if (e instanceof ApiTimeoutError) {
    return `DevDigest API did not answer within ${Math.round(e.timeoutMs / 1000)}s (it may be syncing GitHub); retry shortly.`;
  }
  if (e instanceof ApiError) {
    if (e.status === 429) return 'DevDigest rate limit hit (run_review: 10/min). Wait ~60s, then retry.';
    const msg = truncate(e.message, 500);
    return e.status >= 500 ? `DevDigest API error (${e.code}): ${msg}` : msg;
  }
  return null;
}

/** Single mapping from thrown errors to MCP tool errors (analogue of the server's error handler). */
export function toToolError(e: unknown): CallToolResult {
  const text = messageFor(e);
  if (text !== null) return toolError(text);
  log.error('unexpected tool error', { error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  return toolError('Unexpected error in the DevDigest MCP server. See the server stderr log.');
}

export async function runTool(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return toToolError(e);
  }
}
