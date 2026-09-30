---
name: onion-architecture
description: "Use when adding or changing a server/ endpoint, service, repository, or external integration (GitHub, git, LLM, embedder, secrets, code index) in DevDigest, when copying an existing module as a template, or when reviewing server code for layering violations such as a route calling container.db or container.github() directly."
---

# Onion architecture (server/)

Dependencies point **inward**. The outside world (HTTP, Postgres, GitHub, LLMs) sits on the
edge; business rules sit in the middle and know nothing about Fastify, Drizzle, or SDKs.

**Violating the letter of the layering is violating its spirit.** "It's just one query" is how
`pulls/routes.ts` became the legacy file nobody should copy.

## The layers

```
  routes.ts  ──►  service.ts  ──►  domain (pure)
 (transport)    (application)     helpers.ts, severity.ts, @devdigest/reviewer-core,
      │              │            @devdigest/shared contracts + port interfaces
      │              ▼
      │     via app.container (composition root: src/platform/container.ts)
      │              ▼
      └──✗──►  edge: repository.ts (Drizzle / container.db)
                     src/adapters/<port>/<provider>.ts (implements a @devdigest/shared port)
```

| Layer | File | May depend on | Must not |
|-------|------|---------------|----------|
| Transport | `modules/<m>/routes.ts` | its `service.ts`, `getContext`, Zod schemas, `platform/errors` | touch `container.db`, `container.github()/llm()/git/secrets`, `db/schema`, `adapters/*`, another module's repository |
| Application | `modules/<m>/service.ts` | repositories (built with `container.db`), ports from the container, domain code | import Fastify types; build prompts (that is `reviewer-core`) |
| Domain | `helpers.ts`, `severity.ts`, `reviewer-core`, `vendor/shared` | other pure code only | import `container`, `db`, `adapters`, SDKs, or do I/O |
| Edge: persistence | `modules/<m>/repository.ts` | `db/schema`, `drizzle-orm`, `Db` | contain business decisions |
| Edge: integrations | `src/adapters/<port>/<provider>.ts` | the SDK + the port interface in `vendor/shared/adapters.ts` | be constructed outside `container.ts` |

Composition: `container.ts` builds adapters (secrets-backed, lazily) and shared repositories
(`agentsRepo`, `reviewRepo`). Tests swap them with `ContainerOverrides` + `adapters/mocks.ts`.

## The canonical route → service shape

```ts
// modules/agents/routes.ts — transport: validate, resolve tenancy, delegate, map null → 404
export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService(app.container);

  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await service.get(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  });
}

// modules/<m>/service.ts — application: ports come from the container
constructor(private container: Container) { this.repo = new XRepository(container.db); }
async sync(ws: string, id: string) {
  const gh = await this.container.github();   // port (GitHubClient), never `new OctokitGitHubClient`
  ...
}
```

## Adding an external integration

1. Port: add the method/interface to `server/src/vendor/shared/adapters.ts` (mirror to client in the same commit).
2. Adapter: implement it in `src/adapters/<port>/<provider>.ts`; secrets only via `SecretsProvider`.
3. Mock: extend the `Mock<Port>` in `src/adapters/mocks.ts`.
4. Wire: construct it in `src/platform/container.ts` (+ a `ContainerOverrides` field).
5. Consume: from a **service**, through `this.container.<port>`.

If an adapter export is a pure function with no I/O and no secret (e.g. `parseUnifiedDiff` in
`adapters/git/diff-parser.ts`), a service may import it directly. Anything that does I/O goes
through the container.

## Decisions the layers settle

- **Module has no service/repository yet** (e.g. `pulls/`): create `service.ts` (class `<Name>Service`, `constructor(private container: Container)`) and `repository.ts` (class `<Name>Repository`, `constructor(private db: Db)`) in that module folder. Existing handlers stay as they are.
- **Transactions** belong in the repository (`this.db.transaction(async (tx) => …)`), exposed as one method (`replaceLabels`). The service never sees `tx`.
- **Integration unavailable** (no token, GitHub down): the service decides. A read endpoint falls back to stored rows; an explicit refresh/sync action lets the `ConfigError` / upstream error reach the error handler.
- **New table**: edit `src/db/schema/*.ts` → `pnpm db:generate` → new migration → `pnpm db:migrate`. Never edit an existing migration.
- **Tests**: service/route logic → hermetic test in `server/test/<module>-*.test.ts` using `buildApp({ config, overrides: { github: new MockGitHubClient(...) } })` + `app.inject` (see `routes-smoke.test.ts`); SQL in a repository → `server/test/<module>.it.test.ts`.

## Legacy modules — do not copy

`modules/pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` still
call `container.db` / `container.github()` / `container.secrets` from handlers. Templates to copy
instead: `modules/agents/`, `modules/repos/`, `modules/reviews/`. When you add behaviour to a
legacy route, put the new logic in a service and call it from the handler.

## Red flags — stop and move the code inward

- `container.db`, `container.github()`, `container.llm(`, `container.git`, `container.secrets` inside `routes.ts`
- `import ... from '../../adapters/...'` or `'../../db/schema'` in `routes.ts`
- `new SomeAdapter(...)` anywhere but `container.ts`
- A service importing `FastifyRequest` / `FastifyReply`
- `helpers.ts` importing `Container` or doing `await` on I/O
- "The deadline is close, I'll inline it in the handler" — the service is ~15 extra lines

Related: `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `security`.
