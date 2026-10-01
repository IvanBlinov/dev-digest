import type {
  CreateSkillBody,
  Skill,
  SkillImportCommit,
  SkillImportPreview,
  SkillImportRequest,
  SkillVersion,
  UpdateSkillBody,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../platform/errors.js';
import type { SkillRow, SkillsRepository } from './repository.js';
import { isContentChange, isUniqueViolation, toSkillDto, toSkillVersionDto } from './helpers.js';
import { decodeUpload, parseSkillUpload, SkillImportError } from './import.js';
import {
  INITIAL_VERSION_MESSAGE,
  SKILL_NAME_UNIQUE_CONSTRAINT,
  importedMessage,
  restoredMessage,
} from './constants.js';

/**
 * L02 — skills service: CRUD, versioning (every content change is a new
 * immutable snapshot; restore is non-destructive) and the two-step import.
 * Workspace-scoped; name is unique per workspace (409).
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = container.skillsRepo;
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return this.withCounts(rows);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? (await this.withCounts([row]))[0] : undefined;
  }

  async create(workspaceId: string, body: CreateSkillBody): Promise<Skill> {
    await this.assertNameFree(workspaceId, body.name);
    const row = await this.guardName(body.name, () => this.repo.insert({
      workspaceId,
      name: body.name,
      description: body.description,
      type: body.type,
      source: 'manual',
      body: body.body,
      enabled: body.enabled,
      message: INITIAL_VERSION_MESSAGE,
    }));
    return toSkillDto(row, 0);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillBody): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    if (patch.name !== undefined && patch.name !== existing.name) {
      await this.assertNameFree(workspaceId, patch.name);
    }
    // The repository increments the version atomically; we only decide whether to.
    const bump = isContentChange(existing, patch) ? { message: patch.message ?? null } : null;
    const row = await this.guardName(patch.name ?? existing.name, () =>
      this.repo.update(workspaceId, id, patch, bump),
    );
    return row ? this.get(workspaceId, row.id) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return (await this.repo.listVersions(id)).map(toSkillVersionDto);
  }

  /** Restore = a NEW version carrying the old body; history is never rewritten. */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new NotFoundError(`Version ${version} not found`);
    await this.guardName(skill.name, () =>
      this.repo.update(workspaceId, id, { body: snapshot.body }, { message: restoredMessage(version) }),
    );
    return (await this.get(workspaceId, id))!;
  }

  /** Parse an upload without saving anything. */
  previewImport(req: SkillImportRequest): SkillImportPreview {
    try {
      return parseSkillUpload(req.filename, decodeUpload(req.content_base64));
    } catch (err) {
      if (err instanceof SkillImportError) throw new BadRequestError(err.message);
      throw err;
    }
  }

  /** Parse again (never trust a client-side preview), apply edits, save as `imported`. */
  async commitImport(workspaceId: string, commit: SkillImportCommit): Promise<Skill> {
    const parsed = this.previewImport(commit);
    const name = commit.name ?? parsed.name;
    await this.assertNameFree(workspaceId, name);
    const row = await this.guardName(name, () => this.repo.insert({
      workspaceId,
      name,
      description: commit.description ?? parsed.description,
      type: commit.type ?? parsed.type,
      source: 'imported',
      body: parsed.body,
      message: importedMessage(commit.filename),
    }));
    return toSkillDto(row, 0);
  }

  /**
   * The pre-check above is racy; the DB unique index is the real guard — map
   * ONLY its clash to 409. Any other unique violation is a bug and stays a 500.
   */
  private async guardName<T>(name: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err, SKILL_NAME_UNIQUE_CONSTRAINT)) throw new ConflictError(`A skill named "${name}" already exists`);
      throw err;
    }
  }

  private async assertNameFree(workspaceId: string, name: string): Promise<void> {
    if (await this.repo.getByName(workspaceId, name)) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }

  private async withCounts(rows: SkillRow[]): Promise<Skill[]> {
    const counts = await this.repo.agentCounts(rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }
}
