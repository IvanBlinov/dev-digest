/* hooks/skills.ts — React Query hooks for the L02 Skills Lab (/skills, /skills/:id). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CreateSkillBody,
  Skill,
  SkillImportCommit,
  SkillImportPreview,
  SkillImportRequest,
  SkillUrlImportCommit,
  SkillUrlImportRequest,
  SkillVersion,
  UpdateSkillBody,
} from "@devdigest/shared";

export const SKILLS_KEY = ["skills"] as const;
export const skillKey = (id: string | null | undefined) => ["skill", id] as const;
export const skillVersionsKey = (id: string | null | undefined) => ["skill-versions", id] as const;

/** A saved skill changes the list, its detail cache and its version history. */
function refreshSkill(qc: QueryClient, skill: Skill) {
  qc.setQueryData(skillKey(skill.id), skill);
  qc.invalidateQueries({ queryKey: SKILLS_KEY });
  qc.invalidateQueries({ queryKey: skillVersionsKey(skill.id) });
}

export function useSkills() {
  return useQuery({ queryKey: SKILLS_KEY, queryFn: () => api.get<Skill[]>("/skills") });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKey(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillVersionsKey(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSkillBody) => api.post<Skill>("/skills", body),
    onSuccess: (skill) => refreshSkill(qc, skill),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: UpdateSkillBody;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => {
      refreshSkill(qc, skill);
      // The global toggle changes which skills reach agents.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: SKILLS_KEY });
      qc.removeQueries({ queryKey: skillKey(id) });
      qc.removeQueries({ queryKey: skillVersionsKey(id) });
      // Links cascade, so agent skill counts change.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export interface RestoreSkillInput {
  id: string;
  version: number;
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: RestoreSkillInput) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (skill) => refreshSkill(qc, skill),
  });
}

/** Parse an uploaded .md/.zip without saving anything. */
export function usePreviewSkillImport() {
  return useMutation({
    mutationFn: (body: SkillImportRequest) => api.post<SkillImportPreview>("/skills/import/preview", body),
  });
}

export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SkillImportCommit) => api.post<Skill>("/skills/import", body),
    onSuccess: (skill) => refreshSkill(qc, skill),
  });
}

/** Fetch a raw .md/.txt URL server-side and parse it without saving anything (L03c). */
export function useSkillUrlImportPreview() {
  return useMutation({
    mutationFn: (body: SkillUrlImportRequest) =>
      api.post<SkillImportPreview>("/skills/import-url/preview", body),
  });
}

/** Save a URL import (source `imported_url`) with the edits made in the preview. */
export function useImportSkillFromUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SkillUrlImportCommit) => api.post<Skill>("/skills/import-url", body),
    onSuccess: (skill) => refreshSkill(qc, skill),
  });
}
