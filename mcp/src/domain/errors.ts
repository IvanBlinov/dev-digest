/** Domain errors: data only. Agent-facing text is built once, in tools/tool-result.ts. */
export class RepoNotFoundError extends Error {
  constructor(
    readonly requested: string,
    readonly known: string[],
  ) {
    super(`repo ${requested} not found`);
    this.name = 'RepoNotFoundError';
  }
}

export class PrNotImportedError extends Error {
  constructor(
    readonly repo: string,
    readonly prNumber: number,
  ) {
    super(`PR #${prNumber} not imported in ${repo}`);
    this.name = 'PrNotImportedError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(
    readonly requested: string,
    readonly names: string[],
  ) {
    super(`agent ${requested} not found`);
    this.name = 'AgentNotFoundError';
  }
}

export class AmbiguousAgentError extends Error {
  constructor(readonly candidates: { name: string; id: string }[]) {
    super('agent name is ambiguous');
    this.name = 'AmbiguousAgentError';
  }
}

export class RunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`run ${runId} not found`);
    this.name = 'RunNotFoundError';
  }
}

export class NoEnabledAgentsError extends Error {
  constructor() {
    super('no enabled agents');
    this.name = 'NoEnabledAgentsError';
  }
}
