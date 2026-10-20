import type {
  ContextAttachments,
  ContextDocFile,
  ContextDocItem,
  ContextListing,
  WorkspaceContextAttachments,
} from '@devdigest/shared';
import type { DocRead } from '../../adapters/docs/index.js';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { scanSkillBody } from '../skills/injection.js';
import { partitionBlockedSkills } from '../reviews/skills-prompt.js';
import { CONTEXT_FILE_READ_MAX_BYTES, CONTEXT_LISTING_CAP, CONTEXT_LISTING_READ_CONCURRENCY } from './constants.js';
import {
  composeListing,
  contextPathError,
  docKind,
  isExcludedDocPath,
  makeRootMatcher,
  tokensEstimate,
} from './helpers.js';

/** Error code of every AC-6 / AC-62 / AC-63 path rejection. */
const INVALID_PATH_CODE = 'invalid_context_path';

/**
 * L05 — application layer of project context: lists and previews the documents of a repo
 * clone. The file system is reached only through the `docs` port; attachments and the
 * workspace aggregate are added next to these.
 */
export class ProjectContextService {
  private repos: RepoRepository;
  private matcher: ReturnType<typeof makeRootMatcher>;

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.matcher = makeRootMatcher(container.config.projectContextRoots);
  }

  private async getRepo(workspaceId: string, repoId: string) {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** AC-2, AC-5, AC-7, AC-8, AC-9, AC-31: matching documents, never their content. */
  async listing(workspaceId: string, repoId: string): Promise<ContextListing> {
    const repo = await this.getRepo(workspaceId, repoId);
    const roots = this.container.config.projectContextRoots;
    const synced_at = repo.lastPolledAt ? repo.lastPolledAt.toISOString() : null;
    if (!repo.clonePath) return { cloned: false, roots, synced_at, truncated: false, documents: [] };

    const docs = this.container.docs;
    const entries = await docs.list(repo.clonePath, this.matcher);
    // Path order, bounded concurrency, stop at the first cap+1 valid documents.
    const documents: ContextDocItem[] = [];
    for (let i = 0; i < entries.length && documents.length <= CONTEXT_LISTING_CAP; i += CONTEXT_LISTING_READ_CONCURRENCY) {
      const batch = entries.slice(i, i + CONTEXT_LISTING_READ_CONCURRENCY);
      const reads = new Map<string, DocRead>();
      await Promise.all(
        batch.map(async (e) => {
          reads.set(e.path, await docs.read(repo.clonePath!, e.path, { maxBytes: CONTEXT_FILE_READ_MAX_BYTES }));
        }),
      );
      documents.push(...composeListing(batch, reads, batch.length).documents);
    }
    const truncated = documents.length > CONTEXT_LISTING_CAP;
    documents.length = Math.min(documents.length, CONTEXT_LISTING_CAP);
    return { cloned: true, roots, synced_at, truncated, documents };
  }

  /** AC-4, AC-6, AC-31, AC-62, AC-63, AC-65: one document with its full text. */
  async file(workspaceId: string, repoId: string, path: string): Promise<ContextDocFile> {
    const repo = await this.getRepo(workspaceId, repoId);
    const error = contextPathError(path, this.matcher);
    if (error || isExcludedDocPath(path)) {
      throw new AppError(INVALID_PATH_CODE, error ?? 'Path is excluded', 422);
    }
    if (!repo.clonePath) throw new NotFoundError('Repository is not cloned');

    const read = await this.container.docs.read(repo.clonePath, path, {
      maxBytes: CONTEXT_FILE_READ_MAX_BYTES,
    });
    if (!read.ok) {
      switch (read.reason) {
        case 'too_large':
          throw new AppError('context_file_too_large', 'Document is larger than 1 MB', 413);
        case 'invalid_path':
          throw new AppError(INVALID_PATH_CODE, 'Path is outside the clone', 422);
        default:
          throw new NotFoundError('Document not found');
      }
    }
    const scan = scanSkillBody(read.content);
    return {
      path,
      kind: docKind(path),
      size: read.size,
      tokens_estimate: tokensEstimate(read.size),
      injection_detected: scan.status === 'blocked',
      content: read.content,
      security: {
        status: scan.status === 'blocked' ? 'flagged' : 'clean',
        findings: scan.findings.map((f) => `${f.label} (line ${f.line})`),
      },
    };
  }

  /** AC-6 at write time: clone-free checks only (Q5); the first failure rejects the whole list. */
  private assertPaths(paths: readonly string[]): void {
    for (const path of paths) {
      const error = contextPathError(path, this.matcher);
      if (error) throw new AppError(INVALID_PATH_CODE, `${path}: ${error}`, 422);
    }
  }

  private async assertAgent(workspaceId: string, id: string): Promise<void> {
    if (!(await this.container.agentsRepo.getById(workspaceId, id))) {
      throw new NotFoundError('Agent not found');
    }
  }

  private async assertSkill(workspaceId: string, id: string): Promise<void> {
    if (!(await this.container.skillsRepo.getById(workspaceId, id))) {
      throw new NotFoundError('Skill not found');
    }
  }

  async agentPaths(workspaceId: string, agentId: string): Promise<ContextAttachments> {
    await this.assertAgent(workspaceId, agentId);
    return { paths: await this.container.contextDocsRepo.pathsForAgent(agentId) };
  }

  /** AC-10, AC-11, AC-13: replaces the list without touching the agent's version. */
  async setAgentPaths(workspaceId: string, agentId: string, paths: string[]): Promise<ContextAttachments> {
    await this.assertAgent(workspaceId, agentId);
    this.assertPaths(paths);
    await this.container.contextDocsRepo.replaceForAgent(agentId, paths);
    return { paths };
  }

  async skillPaths(workspaceId: string, skillId: string): Promise<ContextAttachments> {
    await this.assertSkill(workspaceId, skillId);
    return { paths: await this.container.contextDocsRepo.pathsForSkill(skillId) };
  }

  async setSkillPaths(workspaceId: string, skillId: string, paths: string[]): Promise<ContextAttachments> {
    await this.assertSkill(workspaceId, skillId);
    this.assertPaths(paths);
    await this.container.contextDocsRepo.replaceForSkill(skillId, paths);
    return { paths };
  }

  /**
   * AC-66: attachments per agent (own + inherited through the skills a run would use,
   * same rule as the executor) and per skill. One skills query per agent.
   */
  async workspaceAttachments(workspaceId: string): Promise<WorkspaceContextAttachments> {
    const { agentsRepo, skillsRepo, contextDocsRepo } = this.container;
    const [agents, skills, attached] = await Promise.all([
      agentsRepo.list(workspaceId),
      skillsRepo.list(workspaceId),
      contextDocsRepo.listForWorkspace(workspaceId),
    ]);
    const rows = await Promise.all(
      agents.map(async (agent) => {
        const effective = await skillsRepo.effectiveSkillsForAgent(agent.id);
        const { allowed } = partitionBlockedSkills(effective);
        return {
          id: agent.id,
          name: agent.name,
          paths: attached.agents.get(agent.id) ?? [],
          inherited: allowed
            .map((s) => ({ skill: { id: s.id, name: s.name }, paths: attached.skills.get(s.id) ?? [] }))
            .filter((i) => i.paths.length > 0),
        };
      }),
    );
    return {
      agents: rows,
      skills: skills.map((s) => ({ id: s.id, name: s.name, paths: attached.skills.get(s.id) ?? [] })),
    };
  }
}
