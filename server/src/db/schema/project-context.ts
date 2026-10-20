import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Project context (L05)
// Repo documents (paths relative to a clone root) attached to an agent or a skill.
// Tenancy goes through the owner row (no workspace_id), like `agent_skills`. Attaching
// or detaching a path never bumps `agents.version` / `skills.version`.

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    /** Order the user gave; the run reads documents in this order. */
    position: integer('position').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.path] }) }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.path] }) }),
);
