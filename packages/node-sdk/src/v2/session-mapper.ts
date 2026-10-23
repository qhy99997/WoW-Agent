/**
 * Pure mapping from the agent-core-v2 session index summary to the SDK's
 * `SessionSummary`. The index carries no filesystem facts, so `workDir` /
 * `sessionDir` come in as pre-resolved `SessionSummaryFacts` (the caller
 * derives them from the workspace catalog and `IBootstrapService`).
 */
import type { SessionSummary as V2SessionSummary } from '@wow/agent-core-v2';

import { resolve, win32 } from 'node:path';

import type { JsonObject, SessionSummary } from '#/types';

/**
 * Windows-shaped paths resolve through `win32` and fold to forward slashes,
 * everything else resolves against the process cwd. Byte-identical with the
 * legacy v1 `normalizeWorkDir` so stored workdir keys stay stable.
 */
export function normalizeWorkDir(workDir: string): string {
  if (/^[A-Za-z]:[\\/]/.test(workDir) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(workDir)) {
    return win32.resolve(workDir).replaceAll('\\', '/');
  }
  return resolve(workDir);
}

/** v1 summary fields the v2 index summary does not carry, resolved by the caller. */
export interface SessionSummaryFacts {
  readonly workDir: string;
  readonly sessionDir: string;
  readonly additionalDirs?: readonly string[];
}

export function v2SummaryToSessionSummary(
  summary: V2SessionSummary,
  facts: SessionSummaryFacts,
): SessionSummary {
  return {
    id: summary.id,
    title: summary.title,
    lastPrompt: summary.lastPrompt,
    workDir: facts.workDir,
    sessionDir: facts.sessionDir,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    archived: summary.archived,
    metadata: summary.custom as JsonObject | undefined,
    additionalDirs: facts.additionalDirs,
    lastTurnReason: summary.lastTurnReason,
  };
}
