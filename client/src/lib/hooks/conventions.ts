/* hooks/conventions.ts — React Query hooks for the L03 Conventions screen (/conventions). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type {
  ConventionCandidate,
  ConventionScan,
  ConventionSkillDraft,
  ConventionsState,
  CreateConventionSkillBody,
  CreateConventionSkillResult,
  UpdateConventionBody,
} from "@devdigest/shared";
import { SKILLS_KEY } from "./skills";
import { AGENTS_KEY, agentSkillsKey } from "./agents";

/** Poll interval (ms) while a scan is running. */
export const CONVENTIONS_POLL_MS = 2_000;

export const conventionsKey = (repoId: string | null | undefined) => ["conventions", repoId] as const;
export const conventionSkillDraftKey = (repoId: string | null | undefined, ids: readonly string[]) =>
  ["convention-skill-draft", repoId, ...ids] as const;

/** True while the latest scan is still running — drives polling and the disabled scan button. */
export function isScanRunning(state: ConventionsState | undefined): boolean {
  return state?.scan?.status === "running";
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKey(repoId),
    queryFn: () => api.get<ConventionsState>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) => (isScanRunning(query.state.data) ? CONVENTIONS_POLL_MS : false),
  });
}

/** Start (or re-run) a scan. The server answers 202 with the `running` scan; polling takes over. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = conventionsKey(repoId);
  return useMutation({
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => {
      qc.setQueryData<ConventionsState>(key, (prev) => (prev ? { ...prev, scan } : prev));
      qc.invalidateQueries({ queryKey: key });
    },
  });
}

type Snapshot = { previous: ConventionsState | undefined };

/** Apply a patch to one candidate in a cached state; `rejected` removes it (req 48). */
export function applyConventionPatch(
  state: ConventionsState,
  id: string,
  patch: UpdateConventionBody,
): ConventionsState {
  if (patch.status === "rejected") {
    return { ...state, candidates: state.candidates.filter((c) => c.id !== id) };
  }
  return {
    ...state,
    candidates: state.candidates.map((c) =>
      c.id === id
        ? { ...c, ...patch, ...(patch.status ? { accepted: patch.status === "accepted" } : {}) }
        : c,
    ),
  };
}

async function snapshotAndApply(
  qc: QueryClient,
  repoId: string | null | undefined,
  update: (state: ConventionsState) => ConventionsState,
): Promise<Snapshot> {
  const key = conventionsKey(repoId);
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<ConventionsState>(key);
  if (previous) qc.setQueryData<ConventionsState>(key, update(previous));
  return { previous };
}

function rollback(qc: QueryClient, repoId: string | null | undefined, ctx: Snapshot | undefined) {
  if (ctx?.previous) qc.setQueryData(conventionsKey(repoId), ctx.previous);
}

export interface UpdateConventionInput {
  id: string;
  patch: UpdateConventionBody;
}

/** A PATCH that 404s: the candidate no longer exists (replaced by a re-scan). */
export function isGoneConventionError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Accept / un-accept / reject / inline-edit one candidate. Optimistic, rolled back on error
 *  (the error toast comes from the global MutationCache in providers.tsx). */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: ({ id, patch }) => snapshotAndApply(qc, repoId, (st) => applyConventionPatch(st, id, patch)),
    onError: (err, _v, ctx) => {
      rollback(qc, repoId, ctx);
      // The candidate vanished (a re-scan replaced it while its card was open) — reload the list
      // so the stale card is swapped for the current candidates instead of failing again.
      if (isGoneConventionError(err)) void qc.invalidateQueries({ queryKey: conventionsKey(repoId) });
    },
    onSuccess: (saved) => {
      // Keep the card where it is (no re-sort mid-review); just take the server's version.
      qc.setQueryData<ConventionsState>(conventionsKey(repoId), (prev) =>
        prev && saved.status !== "rejected"
          ? { ...prev, candidates: prev.candidates.map((c) => (c.id === saved.id ? saved : c)) }
          : prev,
      );
    },
  });
}

/** "Deselect all": every given accepted candidate goes back to pending. */
export function useDeselectConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.patch<ConventionCandidate>(`/conventions/${id}`, { status: "pending" }))),
    onMutate: (ids) =>
      snapshotAndApply(qc, repoId, (st) => ids.reduce((acc, id) => applyConventionPatch(acc, id, { status: "pending" }), st)),
    onError: (_e, _v, ctx) => rollback(qc, repoId, ctx),
    onSettled: () => qc.invalidateQueries({ queryKey: conventionsKey(repoId) }),
  });
}

/** Editable starting point of the Create-skill modal, built server-side from the accepted ids (req 41). */
export function useConventionSkillDraft(repoId: string | null | undefined, candidateIds: readonly string[]) {
  return useQuery({
    queryKey: conventionSkillDraftKey(repoId, candidateIds),
    queryFn: () =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, { candidate_ids: candidateIds }),
    enabled: !!repoId && candidateIds.length > 0,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

/** Save the skill (+ optional agent link). The Skills and Agents lists must show it (req 52). */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConventionSkillBody) =>
      api.post<CreateConventionSkillResult>(`/repos/${repoId}/conventions/skill`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: SKILLS_KEY });
      qc.invalidateQueries({ queryKey: AGENTS_KEY });
      if (res.linked_agent_id) qc.invalidateQueries({ queryKey: agentSkillsKey(res.linked_agent_id) });
      qc.invalidateQueries({ queryKey: conventionsKey(repoId) });
    },
  });
}
