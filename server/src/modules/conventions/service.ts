import {
  ExtractedConventions,
  type ConventionCandidate,
  type ConventionScan,
  type ConventionSkillDraft,
  type ConventionsState,
  type CreateConventionSkillBody,
  type CreateConventionSkillResult,
  type UpdateConventionBody,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository, type ConventionScanRow } from './repository.js';
import {
  buildSkillDraft,
  groundConventions,
  planRescan,
  sortCandidates,
  toCandidateDto,
  toConventionPatch,
  toScanDto,
} from './helpers.js';
import { buildExtractionMessages } from './prompt.js';
import {
  configCandidatePaths,
  configPathsFromList,
  configSearchDirs,
  mergeSamples,
  prepareSample,
  PACKAGE_MANIFEST,
  type SampleFile,
  type SampleKind,
} from './sampler.js';
import {
  EXTRACT_MAX_RETRIES,
  EXTRACT_MAX_TOKENS,
  EXTRACT_TEMPERATURE,
  EXTRACT_TIMEOUT_MS,
  MAX_CONFIG_FILES,
  MAX_SCAN_ERROR_CHARS,
  RANKED_PATHS_FOR_DIRS,
  SAMPLE_FILE_COUNT,
  SCAN_JOB_TIMEOUT_MS,
  STALE_SCAN_ERROR,
  STALE_SCAN_MS,
  scanTimeoutMessage,
  skillVersionMessage,
} from './constants.js';

/** Minimal logger the background job reports to (Fastify's logger fits). */
export interface ScanLogger {
  error(obj: unknown, msg?: string): void;
}

/**
 * L03 — conventions service: sample a repo (no LLM), extract grounded
 * convention candidates in the background, accept/reject/edit them, and turn
 * the accepted ones into one skill (optionally linked to an agent).
 */
export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;
  private skills: SkillsService;
  /** In-flight background scans (scan id → promise); awaited by `settle()` in tests. */
  private inflight = new Map<string, Promise<void>>();

  constructor(
    private container: Container,
    private log?: ScanLogger,
  ) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
    this.skills = new SkillsService(container);
  }

  // ---- read ------------------------------------------------------------------

  async state(workspaceId: string, repoId: string): Promise<ConventionsState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.failStale(repoId);
    const [samples, scan, rows] = await Promise.all([
      this.container.repoIntel.getConventionSamples(repoId, 1),
      this.repo.latestScan(workspaceId, repoId),
      this.repo.listVisible(workspaceId, repoId),
    ]);
    return {
      repo_id: repo.id,
      repo_name: repo.fullName,
      indexed: samples.length > 0,
      scan: scan ? toScanDto(scan) : null,
      candidates: sortCandidates(rows.map(toCandidateDto)),
    };
  }

  // ---- extract (req 38, 39, 40) ----------------------------------------------

  /** Sample, open a `running` scan and continue in the background. 422 unindexed, 409 running. */
  async startExtract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.requireRepo(workspaceId, repoId);
    await this.failStale(repoId);
    if (await this.repo.runningScan(repoId)) throw new ConflictError('A conventions scan is already running');

    const ranked = await this.container.repoIntel.getTopFilesByRank(repoId, RANKED_PATHS_FOR_DIRS);
    if (ranked.length === 0) {
      throw new ValidationError('Repository is not indexed — index it before scanning conventions');
    }
    const files = await this.collectSamples(repo, ranked);
    if (files.length === 0) throw new ValidationError('No readable files to sample in this repository');

    const model = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const scan = await this.repo.createScanIfIdle({
      workspaceId,
      repoId,
      provider: model.provider,
      model: model.model,
      sampleFiles: files.map((f) => f.path),
    });
    if (!scan) throw new ConflictError('A conventions scan is already running');

    const job = this.runScan(scan, repo, files).finally(() => this.inflight.delete(scan.id));
    this.inflight.set(scan.id, job);
    return toScanDto(scan);
  }

  /** Resolves once every background scan started by this service has settled. */
  async settle(): Promise<void> {
    await Promise.allSettled([...this.inflight.values()]);
  }

  /** Never rejects: any failure is stored on the scan (`failed`, `error`). */
  private async runScan(scan: ConventionScanRow, repo: RepoRow, files: SampleFile[]): Promise<void> {
    try {
      await withTimeout(this.extractAndStore(scan, repo, files), SCAN_JOB_TIMEOUT_MS);
    } catch (err) {
      const raw = err instanceof TimeoutError ? scanTimeoutMessage(scan.provider, scan.model) : err instanceof Error ? err.message : String(err);
      const message = raw.slice(0, MAX_SCAN_ERROR_CHARS);
      this.log?.error({ err, scanId: scan.id, repoId: repo.id }, 'conventions scan failed');
      await this.repo.failScan(scan.id, message || 'Scan failed').catch((e) => {
        this.log?.error({ err: e, scanId: scan.id }, 'could not mark conventions scan failed');
      });
    }
  }

  private async extractAndStore(scan: ConventionScanRow, repo: RepoRow, files: SampleFile[]): Promise<void> {
    const llm = await this.container.llm(scan.provider as 'openai' | 'anthropic' | 'openrouter');
    const result = await llm.completeStructured({
      model: scan.model,
      schema: ExtractedConventions,
      schemaName: 'ConventionExtraction',
      messages: buildExtractionMessages(repo.fullName, files),
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      maxRetries: EXTRACT_MAX_RETRIES,
    });
    const grounded = groundConventions(result.data.conventions, files);
    const existing = await this.repo.listAll(scan.workspaceId, scan.repoId);
    const plan = planRescan(existing, grounded);
    await this.repo.completeScan(scan, plan.deleteIds, plan.insert);
  }

  /** Configs (root + one level deep, package.json-adjacent) first, then top-ranked samples. */
  private async collectSamples(repo: RepoRow, ranked: string[]): Promise<SampleFile[]> {
    const ref = { owner: repo.owner, name: repo.name };
    const read = async (path: string, kind: SampleKind): Promise<SampleFile | null> => {
      try {
        return prepareSample(path, kind, await this.container.git.readFile(ref, path));
      } catch {
        return null; // missing / unreadable file — simply not sampled
      }
    };
    const exists = async (path: string) => (await read(path, 'config')) !== null;

    const configPaths = new Set(configPathsFromList(ranked));
    for (const dir of configSearchDirs(ranked)) {
      if (dir && !(await exists(`${dir}/${PACKAGE_MANIFEST}`))) continue;
      for (const p of configCandidatePaths(dir)) configPaths.add(p);
    }
    const configs: SampleFile[] = [];
    for (const p of configPaths) {
      if (configs.length >= MAX_CONFIG_FILES) break;
      const f = await read(p, 'config');
      if (f) configs.push(f);
    }

    const samplePaths = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    const samples = (await Promise.all(samplePaths.map((p) => read(p, 'sample')))).filter(
      (f): f is SampleFile => f !== null,
    );
    return mergeSamples(configs, samples);
  }

  private async failStale(repoId: string): Promise<void> {
    await this.repo.failStaleScans(repoId, new Date(Date.now() - STALE_SCAN_MS), STALE_SCAN_ERROR);
  }

  // ---- candidate edits (req 47–49) ----------------------------------------------

  async update(workspaceId: string, id: string, body: UpdateConventionBody): Promise<ConventionCandidate | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const patch = toConventionPatch(body);
    const start = patch.evidenceStartLine !== undefined ? patch.evidenceStartLine : existing.evidenceStartLine;
    const end = patch.evidenceEndLine !== undefined ? patch.evidenceEndLine : existing.evidenceEndLine;
    if (start != null && end != null && start > end) {
      throw new BadRequestError('evidence_start_line must not be after evidence_end_line');
    }
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  // ---- skill (req 41, 42, 51, 52) ------------------------------------------------

  async skillDraft(workspaceId: string, repoId: string, candidateIds: string[]): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const candidates = await this.acceptedCandidates(workspaceId, repoId, candidateIds);
    return buildSkillDraft(repo.fullName, candidates);
  }

  /**
   * Create the skill (source `extracted`, evidence = distinct candidate paths)
   * and append an enabled link to the chosen agent. If linking fails the new
   * skill is deleted again, so a failure never leaves a half state.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    body: CreateConventionSkillBody,
  ): Promise<CreateConventionSkillResult> {
    await this.requireRepo(workspaceId, repoId);
    const candidates = await this.acceptedCandidates(workspaceId, repoId, body.candidate_ids);
    const agentsRepo = this.container.agentsRepo;
    if (body.agent_id && !(await agentsRepo.getById(workspaceId, body.agent_id))) {
      throw new BadRequestError('Agent not found in this workspace');
    }

    const created = await this.skills.createWithOrigin(
      workspaceId,
      { name: body.name, description: body.description, type: body.type, body: body.body, enabled: body.enabled },
      {
        source: 'extracted',
        message: skillVersionMessage(candidates.length),
        evidenceFiles: [...new Set(candidates.map((c) => c.evidence_path).filter(Boolean))],
      },
    );

    if (body.agent_id) {
      try {
        const links = await agentsRepo.linkedSkills(body.agent_id);
        const order = links.reduce((max, l) => Math.max(max, l.order + 1), 0);
        await agentsRepo.linkSkill(body.agent_id, created.id, order);
      } catch (err) {
        await this.skills.delete(workspaceId, created.id);
        throw err;
      }
    }
    const skill = (await this.skills.get(workspaceId, created.id)) ?? created;
    return { skill, linked_agent_id: body.agent_id ?? null };
  }

  /** The requested candidates, in request order — all must belong to the repo and be accepted (else 400). */
  private async acceptedCandidates(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionCandidate[]> {
    const unique = [...new Set(ids)];
    const rows = await this.repo.getByIds(workspaceId, repoId, unique);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = unique.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new BadRequestError(`Conventions not found in this repository: ${missing.join(', ')}`);
    const notAccepted = rows.filter((r) => r.status !== 'accepted').map((r) => r.id);
    if (notAccepted.length > 0) {
      throw new BadRequestError(`Only accepted conventions can be used: ${notAccepted.join(', ')}`);
    }
    return unique.map((id) => toCandidateDto(byId.get(id)!));
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
