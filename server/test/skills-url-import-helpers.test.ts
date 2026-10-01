import { describe, it, expect } from 'vitest';
import {
  isAcceptedTextFile,
  normalizeSkillUrl,
  textFileRejection,
  urlFileName,
} from '../src/modules/skills/helpers.js';
import { parseSkillMarkdownText } from '../src/modules/skills/import.js';

/** L03c — pure helpers behind "Import a skill from a URL". */
describe('normalizeSkillUrl', () => {
  it.each([
    [
      'https://github.com/IvanBlinov/dev-digest/blob/main/.claude/skills/security/SKILL.md',
      'https://raw.githubusercontent.com/IvanBlinov/dev-digest/main/.claude/skills/security/SKILL.md',
    ],
    [
      '  https://www.github.com/o/r/blob/v1.2/docs/a%20b.md?plain=1#L3  ',
      'https://raw.githubusercontent.com/o/r/v1.2/docs/a%20b.md',
    ],
    ['https://github.com/o/r/raw/main/SKILL.md', 'https://raw.githubusercontent.com/o/r/main/SKILL.md'],
    [
      'https://raw.githubusercontent.com/o/r/main/SKILL.md',
      'https://raw.githubusercontent.com/o/r/main/SKILL.md',
    ],
    ['https://example.com/skills/x.md', 'https://example.com/skills/x.md'],
    // not a file view — left alone
    ['https://github.com/o/r', 'https://github.com/o/r'],
    ['https://github.com/o/r/tree/main/skills', 'https://github.com/o/r/tree/main/skills'],
    ['https://gist.github.com/u/abc123', 'https://gist.github.com/u/abc123'],
    ['  not a url ', 'not a url'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSkillUrl(input)).toBe(expected);
  });
});

describe('urlFileName', () => {
  it.each([
    ['https://raw.githubusercontent.com/o/r/main/skills/SKILL.md', 'SKILL.md'],
    ['https://example.com/a/My%20Skill.markdown?x=1', 'My Skill.markdown'],
    ['https://example.com/notes.txt#top', 'notes.txt'],
    ['https://example.com/', ''],
    ['https://example.com/bad%E0%A4%A.md', 'bad%E0%A4%A.md'],
  ])('%s → %j', (url, name) => {
    expect(urlFileName(url)).toBe(name);
  });
});

describe('isAcceptedTextFile / textFileRejection', () => {
  it.each([
    ['https://x.dev/a.md', 'text/plain; charset=utf-8'],
    ['https://x.dev/a.markdown', 'text/x-markdown'],
    ['https://x.dev/a.txt', null],
    ['https://x.dev/a.MD', 'application/octet-stream'],
    ['https://x.dev/no-extension', 'text/markdown'],
    ['https://x.dev/no-extension', 'text/plain'],
    ['https://x.dev/a.md?raw=1', 'text/plain'],
  ])('accepts %s (%s)', (url, ct) => {
    expect(isAcceptedTextFile(url, ct)).toBe(true);
    expect(textFileRejection(url, ct)).toBeNull();
  });

  it('rejects an HTML page with a hint to use the raw link', () => {
    const reason = textFileRejection('https://github.com/o/r/blob/main/a.md', 'text/html; charset=utf-8');
    expect(reason).toMatch(/HTML page/);
    expect(reason).toMatch(/raw/i);
    expect(isAcceptedTextFile('https://x.dev/a.md', 'text/html')).toBe(false);
  });

  it.each([
    ['https://x.dev/script.js', 'text/javascript'],
    ['https://x.dev/data.json', 'application/json'],
    ['https://x.dev/no-extension', null],
    ['https://x.dev/no-extension', 'application/octet-stream'],
    ['https://x.dev/a.zip', 'application/zip'],
    ['https://x.dev/a.md', 'image/png'],
  ])('rejects %s (%s)', (url, ct) => {
    expect(isAcceptedTextFile(url, ct)).toBe(false);
    expect(textFileRejection(url, ct)).toMatch(/\.md, \.markdown or \.txt/);
  });
});

describe('parseSkillMarkdownText', () => {
  it('parses frontmatter like an uploaded .md', () => {
    const p = parseSkillMarkdownText('---\r\nname: Url Skill\r\ntype: rubric\r\n---\r\n# H\r\n\r\nBody.\r\n', 'SKILL.md');
    expect(p).toMatchObject({ name: 'url-skill', type: 'rubric', description: 'Body.', source_file: 'SKILL.md' });
    expect(p.body).toBe('# H\n\nBody.\n');
  });

  it('derives the name from a .txt / .markdown file name when there is no heading', () => {
    expect(parseSkillMarkdownText('Plain rules only.', 'review-rules.txt').name).toBe('review-rules');
    expect(parseSkillMarkdownText('Plain rules only.', 'api-guard.markdown').name).toBe('api-guard');
  });

  it('rejects an empty body', () => {
    expect(() => parseSkillMarkdownText('﻿  \n', 'a.md')).toThrow(/empty/);
  });
});
