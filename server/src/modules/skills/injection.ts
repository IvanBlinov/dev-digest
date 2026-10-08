import type { SkillInjectionFinding, SkillSecurity } from '@devdigest/shared';
import { MAX_INJECTION_EXCERPT_CHARS } from './constants.js';

/**
 * L03b — rule-based prompt-injection scan of a skill body. Pure, deterministic,
 * no LLM. Computed on every read (never stored), so new rules apply to existing
 * skills and a clean save clears the labels at once.
 *
 * Rules are HIGH-PRECISION on purpose: any finding blocks the skill, so a
 * pattern must name an attack (override the reviewer, force a verdict, leak the
 * prompt, forge a role/delimiter), not a topic. Seeded skills and conventions
 * drafts must scan clean (test/skills-injection.test.ts).
 *
 * Matching is line-based on a normalised copy of each line (hidden characters
 * removed, markdown emphasis/backticks stripped), so `ig<ZWSP>nore` or
 * `**Ignore** all previous instructions` still match.
 */

type Severity = SkillInjectionFinding['severity'];

interface TextRule {
  id: string;
  label: string;
  severity: Severity;
  patterns: readonly RegExp[];
  /** Skip lines inside a closed code fence (code legitimately has `SYSTEM:` keys, `<untrusted>` literals). */
  skipInCode?: boolean;
}

/** Start of an imperative clause: line start, a list bullet / number, or after `.`, `!`, `?`, `;`. */
const CLAUSE_START = String.raw`(?:^\s*(?:[-*+>]\s+|\d+[.)]\s+)?|[.!?;]\s+)`;
/** End of a clause: punctuation, end of line, or an escalating tail. */
const CLAUSE_END = String.raw`(?=\s*(?:[.,;:!?)]|$|\s(?:regardless|at\s+all|whatsoever|even|ever)\b))`;

const ci = (source: string) => new RegExp(source, 'i');

const RULES: readonly TextRule[] = [
  {
    id: 'ignore-instructions',
    label: 'Overrides previous instructions',
    severity: 'high',
    patterns: [
      ci(
        String.raw`\b(?:ignore|disregard|forget|override|bypass)\s+(?:(?:all|any|the|of|everything)\s+)*(?:previous|prior|above|earlier|preceding|system|safety)\s+(?:\w+\s+)?(?:instructions?|prompts?|rules|guidelines|directives|constraints|messages?)\b`,
      ),
      ci(String.raw`\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+)?(?:your|my)\s+(?:\w+\s+)?(?:instructions|rules|guidelines|directives|system\s+prompt|programming)\b`),
    ],
  },
  {
    id: 'role-reassignment',
    label: 'Reassigns the reviewer’s role',
    severity: 'high',
    patterns: [
      ci(String.raw`\byou\s+are\s+(?:now|no\s+longer)\s+(?:an?\s+|the\s+|in\s+)?\w`),
      ci(String.raw`\bwith\s+no\s+(?:restrictions|limits|limitations|filters|guardrails|rules)\b`),
      ci(String.raw`\bact\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|uncensored|jailbroken)\b`),
      ci(String.raw`\bjail\s?break(?:s|ing|en)?\b`),
      ci(String.raw`\bDAN\s+mode\b`),
      ci(String.raw`\bdeveloper\s+mode\s+(?:enabled|on|activated)\b`),
    ],
  },
  {
    id: 'fake-role-marker',
    label: 'Fake chat-role marker',
    severity: 'high',
    skipInCode: true,
    patterns: [
      ci(String.raw`^\s*(?:system|assistant|developer)\s*:`),
      ci(String.raw`<\|\s*im_(?:start|end|sep)\s*\|>`),
      ci(String.raw`\[\/?INST\]`),
      ci(String.raw`<<\/?SYS>>`),
      ci(String.raw`<\/?\s*(?:system|assistant)\s*>`),
    ],
  },
  {
    id: 'verdict-forcing',
    label: 'Forces the review verdict or score',
    severity: 'high',
    patterns: [
      ci(String.raw`\balways\s+(?:give|return|output|set|assign|use|report)\s+(?:it\s+)?(?:an?\s+|the\s+)?(?:score|rating)\s*(?:of|to|:|=)?\s*["']?100\b`),
      ci(String.raw`\bapprove\s+(?:all|every|any|each)\s+(?:the\s+|of\s+the\s+)?(?:prs?|pull\s+requests?|merge\s+requests?|mrs?|changes?|diffs?)\b`),
      ci(String.raw`\balways\b[^.\n]{0,60}\bverdict\b[^.\n]{0,20}\bapprove`),
      ci(String.raw`\b(?:approve|lgtm|pass)\b[^.\n]{0,60}\bregardless\s+of\b`),
    ],
  },
  {
    id: 'suppress-findings',
    label: 'Suppresses security findings',
    severity: 'medium',
    patterns: [
      ci(
        String.raw`\b(?:never|do\s+not|don'?t|must\s+not|should\s+not)\s+(?:flag|mention|report|raise|comment\s+on|point\s+out)\s+(?:any\s+|the\s+)?(?:(?:security\s+)?(?:issues|vulnerabilit(?:y|ies)|problems|findings|flaws|bugs|risks)|security)` +
          CLAUSE_END,
      ),
    ],
  },
  {
    id: 'prompt-exfiltration',
    label: 'Asks to reveal the prompt or secrets',
    severity: 'high',
    patterns: [
      ci(
        CLAUSE_START +
          String.raw`(?:please\s+)?(?:output|print|reveal|repeat|leak|disclose|dump|exfiltrate|echo)\s+[^.\n]{0,40}?\b(?:system\s+prompts?|agent\s+config(?:uration)?s?|(?:your|the\s+hidden|the\s+original)\s+(?:instructions|prompt|rules|configuration))\b`,
      ),
      ci(
        CLAUSE_START +
          String.raw`(?:please\s+)?(?:output|print|reveal|repeat|leak|disclose|dump|exfiltrate|echo)\s+(?:all|your|any|every)\s+(?:the\s+)?(?:api\s+keys?|secrets?|credentials|tokens|environment\s+variables|env\s+vars)\b`,
      ),
    ],
  },
  {
    id: 'delimiter-spoofing',
    label: 'Spoofs the untrusted-data delimiter',
    severity: 'high',
    skipInCode: true,
    patterns: [ci(String.raw`<\s*\/?\s*untrusted\b`)],
  },
];

const HIDDEN_RULE = {
  id: 'hidden-unicode',
  label: 'Hidden Unicode characters',
  severity: 'medium' as Severity,
};

/** Zero-width, word-joiner/invisible operators, bidi embeddings/overrides/isolates, BOM. */
const HIDDEN_CHARS_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** Markdown emphasis / inline code markers, removed before matching. */
const MARKDOWN_NOISE_RE = /[*_`~]/g;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function scanSkillBody(body: string): SkillSecurity {
  if (!body) return { status: 'clean', findings: [] };
  const lines = body.split(/\r?\n/);
  const inCode = closedFenceMask(lines);
  const findings = lines.flatMap((raw, i) => scanLine(raw, i + 1, inCode[i] ?? false));
  return { status: findings.length > 0 ? 'blocked' : 'clean', findings };
}

export function isSkillBlocked(body: string): boolean {
  return scanSkillBody(body).status === 'blocked';
}

function scanLine(raw: string, line: number, inCode: boolean): SkillInjectionFinding[] {
  const out: SkillInjectionFinding[] = [];
  const hidden = raw.match(HIDDEN_CHARS_RE);
  if (hidden) {
    out.push({ rule: HIDDEN_RULE.id, label: HIDDEN_RULE.label, severity: HIDDEN_RULE.severity, line, excerpt: excerpt(visibleHidden(raw), 0) });
  }
  // Two views: `plain` keeps markdown (special tokens like `<|im_start|>` contain `_`),
  // `text` drops emphasis/backticks so `**Ignore** all previous instructions` matches.
  const plain = raw.replace(HIDDEN_CHARS_RE, '');
  const text = plain.replace(MARKDOWN_NOISE_RE, '');
  for (const rule of RULES) {
    if (inCode && rule.skipInCode) continue;
    const hit = firstHit(rule.patterns, text) ?? firstHit(rule.patterns, plain);
    if (hit) out.push({ rule: rule.id, label: rule.label, severity: rule.severity, line, excerpt: excerpt(hit.text, hit.index) });
  }
  return out;
}

function firstHit(patterns: readonly RegExp[], text: string): { text: string; index: number } | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return { text, index: m.index };
  }
  return null;
}

/** Per line: true when inside a fenced block that is closed later (an unclosed fence hides nothing). */
function closedFenceMask(lines: readonly string[]): boolean[] {
  const mask = lines.map(() => false);
  let open: { marker: string; start: number } | null = null;
  lines.forEach((line, i) => {
    const m = FENCE_RE.exec(line);
    if (!m) return;
    const marker = m[1]!;
    if (open === null) {
      open = { marker, start: i };
    } else if (marker[0] === open.marker[0] && marker.length >= open.marker.length) {
      for (let j = open.start; j <= i; j++) mask[j] = true;
      open = null;
    }
  });
  return mask;
}

function visibleHidden(line: string): string {
  return line.replace(HIDDEN_CHARS_RE, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}>`);
}

/** Trimmed line, windowed around the match when longer than the cap. */
function excerpt(text: string, matchIndex: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_INJECTION_EXCERPT_CHARS) return trimmed;
  const lead = text.length - text.trimStart().length;
  const start = Math.max(0, Math.min(matchIndex - lead - 20, trimmed.length - MAX_INJECTION_EXCERPT_CHARS));
  return trimmed.slice(start, start + MAX_INJECTION_EXCERPT_CHARS);
}
