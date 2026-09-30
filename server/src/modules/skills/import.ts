import { unzipSync, type UnzipFileInfo } from 'fflate';
import { SKILL_BODY_MAX, SkillType, type SkillImportPreview } from '@devdigest/shared';
import {
  FALLBACK_SKILL_NAME,
  MAX_DESCRIPTION_CHARS,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from './constants.js';
import { slugifySkillName } from './helpers.js';

/**
 * L02 — pure parser for skill imports. Input: file name + raw bytes. Output: the
 * skill "core" (name, description, type, markdown body) plus the archive entries
 * that were ignored. Nothing but the one markdown file is ever kept: a skill is
 * configuration text, never code.
 *
 * Throws `SkillImportError` (mapped to 400 by the service) for anything invalid.
 */

export class SkillImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillImportError';
  }
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decode a base64 upload, enforcing the size cap before and after decoding. */
export function decodeUpload(contentBase64: string): Uint8Array {
  const b64 = contentBase64.replace(/\s+/g, '');
  if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) {
    throw new SkillImportError('content_base64 is not valid base64');
  }
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  if ((b64.length / 4) * 3 - padding > MAX_UPLOAD_BYTES) {
    throw new SkillImportError('File is too large (max 1 MB)');
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Parse an uploaded `.md` or `.zip` into a preview. */
export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new SkillImportError('File is too large (max 1 MB)');
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) {
    return parseMarkdown(decodeText(bytes, filename), filename, basename(filename), []);
  }
  if (lower.endsWith('.zip')) return parseZip(bytes);
  throw new SkillImportError('Unsupported file type: upload a .md or .zip file');
}

// ---- zip ------------------------------------------------------------------

function parseZip(bytes: Uint8Array): SkillImportPreview {
  const entries: UnzipFileInfo[] = [];
  let declaredTotal = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    // The filter sees every entry's central-directory metadata BEFORE anything
    // is inflated. Only markdown files are ever inflated; limits are enforced
    // here so a zip bomb is rejected without allocating its payload.
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        entries.push(file);
        declaredTotal += file.originalSize;
        if (entries.length > MAX_ZIP_ENTRIES) {
          throw new SkillImportError(`Archive has too many entries (max ${MAX_ZIP_ENTRIES})`);
        }
        if (declaredTotal > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw new SkillImportError('Archive is too large uncompressed (max 5 MB)');
        }
        return isMarkdown(file.name);
      },
    });
  } catch (err) {
    if (err instanceof SkillImportError) throw err;
    throw new SkillImportError('Could not read the .zip archive (corrupt or unsupported compression)');
  }

  const files = entries.map((e) => e.name).filter((n) => !n.endsWith('/'));
  const core = pickCoreFile(files.filter(isMarkdown));
  const data = unzipped[core];
  if (!data) throw new SkillImportError(`Could not extract ${core}`);
  const ignored = files.filter((n) => n !== core);
  return parseMarkdown(decodeText(data, core), core, zipFallbackName(core), ignored);
}

/** Shallowest `SKILL.md` (case-insensitive), else the only markdown file. */
function pickCoreFile(markdown: string[]): string {
  const skillFiles = markdown
    .filter((n) => basename(n).toLowerCase() === 'skill.md')
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  if (skillFiles[0]) return skillFiles[0];
  if (markdown.length === 1) return markdown[0]!;
  if (markdown.length === 0) throw new SkillImportError('Archive contains no .md file');
  throw new SkillImportError('Archive has several .md files but no SKILL.md to pick the skill from');
}

/** For `pkg/SKILL.md` the folder name is a better fallback than "skill". */
function zipFallbackName(path: string): string {
  const parts = path.split('/');
  const file = parts[parts.length - 1]!;
  if (file.toLowerCase() === 'skill.md' && parts.length > 1) return parts[parts.length - 2]!;
  return file;
}

// ---- markdown -------------------------------------------------------------

interface Frontmatter {
  fields: Record<string, string>;
  body: string;
}

function parseMarkdown(
  text: string,
  sourceFile: string,
  fallbackFile: string,
  ignoredFiles: string[],
): SkillImportPreview {
  const warnings: string[] = [];
  const { fields, body: rawBody } = splitFrontmatter(text);
  const body = rawBody.replace(/^\n+/, '');
  if (body.trim().length === 0) throw new SkillImportError('The skill body is empty');
  if (body.length > SKILL_BODY_MAX) {
    throw new SkillImportError(`The skill body is too long (max ${SKILL_BODY_MAX} characters)`);
  }

  const name = resolveName(fields.name, body, fallbackFile, warnings);
  const description = resolveDescription(fields.description, body, warnings);
  const type = resolveType(fields.type, warnings);

  return { name, description, type, body, source_file: sourceFile, ignored_files: ignoredFiles, warnings };
}

function splitFrontmatter(text: string): Frontmatter {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { fields: {}, body: text };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m) fields[m[1]!.toLowerCase()] = unquote(m[2]!.trim());
  }
  return { fields, body: lines.slice(end + 1).join('\n') };
}

function resolveName(
  fm: string | undefined,
  body: string,
  fallbackFile: string,
  warnings: string[],
): string {
  if (fm) {
    const slug = slugifySkillName(fm);
    if (slug && slug !== fm) warnings.push(`Name "${fm}" was normalized to "${slug}"`);
    if (slug) return slug;
  }
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const fromHeading = heading ? slugifySkillName(heading) : null;
  if (fromHeading) {
    warnings.push(`No name in frontmatter — derived "${fromHeading}" from the first heading`);
    return fromHeading;
  }
  const fromFile = slugifySkillName(fallbackFile.replace(/\.md$/i, ''));
  if (fromFile) {
    warnings.push(`No name or heading — derived "${fromFile}" from the file name`);
    return fromFile;
  }
  warnings.push(`Could not derive a name — using "${FALLBACK_SKILL_NAME}"`);
  return FALLBACK_SKILL_NAME;
}

function resolveDescription(fm: string | undefined, body: string, warnings: string[]): string {
  const raw = fm ?? firstParagraph(body);
  if (raw.length <= MAX_DESCRIPTION_CHARS) return raw;
  warnings.push(`Description was truncated to ${MAX_DESCRIPTION_CHARS} characters`);
  return raw.slice(0, MAX_DESCRIPTION_CHARS);
}

function resolveType(fm: string | undefined, warnings: string[]): SkillType {
  if (fm === undefined) return 'custom';
  const parsed = SkillType.safeParse(fm.toLowerCase());
  if (parsed.success) return parsed.data;
  warnings.push(`Unknown type "${fm}" — using "custom"`);
  return 'custom';
}

/** First run of non-blank, non-heading lines, joined with spaces. */
function firstParagraph(body: string): string {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      if (out.length > 0) break;
      continue;
    }
    out.push(trimmed);
  }
  return out.join(' ');
}

// ---- utils ----------------------------------------------------------------

function decodeText(bytes: Uint8Array, name: string): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SkillImportError(`${name} is not valid UTF-8 text`);
  }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function unquote(v: string): string {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2]! : v;
}

function isMarkdown(path: string): boolean {
  return !path.endsWith('/') && path.toLowerCase().endsWith('.md');
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1]!;
}

function depth(path: string): number {
  return path.split('/').length;
}
