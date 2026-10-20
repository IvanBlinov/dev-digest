import { z } from 'zod';

/**
 * Project context (L05): repo documents (specs, insights, docs) attached to an
 * agent or a skill and injected into the review prompt as untrusted data.
 */

/** Max documents attached to one agent or skill. */
export const CONTEXT_ATTACHMENTS_MAX = 100;

export const ContextDocKind = z.enum(['specs', 'insights', 'docs']);
export type ContextDocKind = z.infer<typeof ContextDocKind>;

/** One listed document. The listing never carries content. */
export const ContextDocItem = z.object({
  path: z.string(),
  kind: ContextDocKind,
  size: z.number().int(),
  tokens_estimate: z.number().int(),
  injection_detected: z.boolean(),
});
export type ContextDocItem = z.infer<typeof ContextDocItem>;

export const ContextListing = z.object({
  cloned: z.boolean(),
  /** The configured root globs. */
  roots: z.array(z.string()),
  /** Last time the clone was synced (repo `last_polled_at`); null when never. */
  synced_at: z.string().nullable(),
  /** True when more documents matched than the listing cap. */
  truncated: z.boolean(),
  documents: z.array(ContextDocItem),
});
export type ContextListing = z.infer<typeof ContextListing>;

export const ContextDocSecurity = z.object({
  status: z.enum(['clean', 'flagged']),
  findings: z.array(z.string()),
});
export type ContextDocSecurity = z.infer<typeof ContextDocSecurity>;

export const ContextDocFile = ContextDocItem.extend({
  content: z.string(),
  security: ContextDocSecurity,
});
export type ContextDocFile = z.infer<typeof ContextDocFile>;

export const ContextFileQuery = z.object({ path: z.string().min(1) });
export type ContextFileQuery = z.infer<typeof ContextFileQuery>;

/** Ordered document paths attached to an agent or a skill. */
export const ContextAttachments = z.object({ paths: z.array(z.string()) });
export type ContextAttachments = z.infer<typeof ContextAttachments>;

export const PutContextAttachmentsBody = z.object({
  paths: z
    .array(z.string())
    .max(CONTEXT_ATTACHMENTS_MAX)
    .refine((p) => new Set(p).size === p.length, 'Duplicate paths'),
});
export type PutContextAttachmentsBody = z.infer<typeof PutContextAttachmentsBody>;

/** Workspace-wide attachment usage: per agent (with skill-inherited paths) and per skill. */
export const WorkspaceContextAttachments = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      paths: z.array(z.string()),
      inherited: z.array(
        z.object({
          skill: z.object({ id: z.string(), name: z.string() }),
          paths: z.array(z.string()),
        }),
      ),
    }),
  ),
  skills: z.array(z.object({ id: z.string(), name: z.string(), paths: z.array(z.string()) })),
});
export type WorkspaceContextAttachments = z.infer<typeof WorkspaceContextAttachments>;
