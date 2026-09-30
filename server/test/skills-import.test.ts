import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { SkillName } from '@devdigest/shared';
import {
  parseSkillUpload,
  decodeUpload,
  SkillImportError,
} from '../src/modules/skills/import.js';
import {
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
} from '../src/modules/skills/constants.js';

const md = (s: string) => strToU8(s);

describe('parseSkillUpload — .md', () => {
  it('reads name/description/type from frontmatter and strips it from the body', () => {
    const p = parseSkillUpload(
      'x.md',
      md('---\nname: api-contract-guard\ndescription: "Flags breaking changes"\ntype: security\n---\n# API\n\nCheck routes.\n'),
    );
    expect(p).toMatchObject({
      name: 'api-contract-guard',
      description: 'Flags breaking changes',
      type: 'security',
      source_file: 'x.md',
      ignored_files: [],
      warnings: [],
    });
    expect(p.body).toBe('# API\n\nCheck routes.\n');
  });

  it('derives name from the first heading and description from the first paragraph', () => {
    const p = parseSkillUpload(
      'whatever.md',
      md('# Test Quality Rubric\n\nEvery branch needs a test.\nBoundaries too.\n\n## More\n\ntext'),
    );
    expect(p.name).toBe('test-quality-rubric');
    expect(p.description).toBe('Every branch needs a test. Boundaries too.');
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toMatch(/heading/i);
  });

  it('falls back to the filename when there is no heading', () => {
    const p = parseSkillUpload('My_Rules File.MD', md('Just some rules.'));
    expect(p.name).toBe('my-rules-file');
    expect(p.description).toBe('Just some rules.');
    expect(p.warnings.join(' ')).toMatch(/file name/i);
  });

  it('normalizes a non-slug frontmatter name and warns', () => {
    const p = parseSkillUpload('a.md', md('---\nname: My Cool Skill!\n---\nbody'));
    expect(p.name).toBe('my-cool-skill');
    expect(p.warnings.join(' ')).toMatch(/normali/i);
  });

  it('ignores an invalid frontmatter type with a warning', () => {
    const p = parseSkillUpload('a.md', md('---\nname: ab\ntype: magic\n---\nbody'));
    expect(p.type).toBe('custom');
    expect(p.warnings.join(' ')).toMatch(/type/i);
  });

  it('strips a UTF-8 BOM and normalizes CRLF', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...md('---\r\nname: bom-skill\r\n---\r\nline1\r\nline2')]);
    const p = parseSkillUpload('a.md', bytes);
    expect(p.name).toBe('bom-skill');
    expect(p.body).toBe('line1\nline2');
  });

  it('truncates the description to 500 chars', () => {
    const p = parseSkillUpload('a.md', md(`# ab\n\n${'x'.repeat(900)}`));
    expect(p.description.length).toBeLessThanOrEqual(500);
  });

  it('always yields a name that satisfies SkillName', () => {
    for (const name of ['!.md', 'a.md', `${'long-'.repeat(40)}.md`, '--x--.md']) {
      const p = parseSkillUpload(name, md('body'));
      expect(SkillName.safeParse(p.name).success).toBe(true);
    }
  });

  it('rejects an empty body', () => {
    expect(() => parseSkillUpload('a.md', md('---\nname: ab\n---\n  \n'))).toThrow(SkillImportError);
  });

  it('rejects non-UTF-8 content', () => {
    expect(() => parseSkillUpload('a.md', new Uint8Array([0xff, 0xfe, 0xfd]))).toThrow(SkillImportError);
  });

  it('rejects other extensions with a clear message', () => {
    expect(() => parseSkillUpload('skill.txt', md('x'))).toThrow(/\.md or \.zip/);
    expect(() => parseSkillUpload('skill.tar.gz', md('x'))).toThrow(SkillImportError);
  });
});

describe('parseSkillUpload — .zip', () => {
  it('uses the shallowest SKILL.md (case-insensitive) and lists everything else as ignored', () => {
    const zip = zipSync({
      'pkg/skill.md': md('---\nname: zipped-skill\ntype: rubric\n---\nRoot body'),
      'pkg/nested/SKILL.md': md('Nested body'),
      'pkg/README.md': md('readme'),
      'pkg/scripts/run.sh': md('rm -rf /'),
      'pkg/empty/': new Uint8Array(),
    });
    const p = parseSkillUpload('bundle.zip', zip);
    expect(p.name).toBe('zipped-skill');
    expect(p.type).toBe('rubric');
    expect(p.body).toBe('Root body');
    expect(p.source_file).toBe('pkg/skill.md');
    expect([...p.ignored_files].sort()).toEqual(
      ['pkg/README.md', 'pkg/nested/SKILL.md', 'pkg/scripts/run.sh'].sort(),
    );
  });

  it('uses the single .md when there is no SKILL.md', () => {
    const zip = zipSync({ 'rules.md': md('# Only One\n\nbody'), 'img.png': new Uint8Array([1, 2]) });
    const p = parseSkillUpload('b.zip', zip);
    expect(p.name).toBe('only-one');
    expect(p.source_file).toBe('rules.md');
    expect(p.ignored_files).toEqual(['img.png']);
  });

  it('rejects a zip with several .md files and no SKILL.md', () => {
    const zip = zipSync({ 'a.md': md('a'), 'b.md': md('b') });
    expect(() => parseSkillUpload('b.zip', zip)).toThrow(/SKILL\.md/);
  });

  it('rejects a zip without markdown', () => {
    const zip = zipSync({ 'a.txt': md('a') });
    expect(() => parseSkillUpload('b.zip', zip)).toThrow(SkillImportError);
  });

  it('rejects too many entries', () => {
    const files: Record<string, Uint8Array> = { 'SKILL.md': md('x') };
    for (let i = 0; i < MAX_ZIP_ENTRIES; i++) files[`f${i}.txt`] = md('x');
    expect(() => parseSkillUpload('b.zip', zipSync(files))).toThrow(/entries/);
  });

  it('rejects a zip bomb (declared uncompressed size over the cap) before inflating', () => {
    const big = new Uint8Array(MAX_ZIP_UNCOMPRESSED_BYTES + 1); // zeros compress to ~KBs
    const zip = zipSync({ 'SKILL.md': md('x'), 'bomb.bin': big }, { level: 9 });
    expect(zip.length).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(() => parseSkillUpload('b.zip', zip)).toThrow(/uncompressed/);
  });

  it('rejects a corrupt archive', () => {
    expect(() => parseSkillUpload('b.zip', md('not a zip at all'))).toThrow(SkillImportError);
  });
});

describe('decodeUpload', () => {
  it('decodes base64', () => {
    expect(Buffer.from(decodeUpload(Buffer.from('hello').toString('base64'))).toString()).toBe('hello');
  });

  it('rejects uploads over 1 MB decoded', () => {
    const b64 = Buffer.alloc(MAX_UPLOAD_BYTES + 1).toString('base64');
    expect(() => decodeUpload(b64)).toThrow(/1 MB/);
  });

  it('rejects malformed base64', () => {
    expect(() => decodeUpload('not base64 !!!')).toThrow(SkillImportError);
  });
});
