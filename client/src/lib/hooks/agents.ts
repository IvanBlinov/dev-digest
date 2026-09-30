/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentSkillLink,
  FindingPreview,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from "@devdigest/shared";
import { SKILLS_KEY } from "./skills";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

/** L01 — newest active findings of an agent (hover preview); fetched only when `enabled`. */
export function useAgentFindings(id: string | null | undefined, enabled: boolean, limit = 6) {
  return useQuery({
    queryKey: ["agent-findings", id, limit],
    queryFn: () => api.get<FindingPreview[]>(`/agents/${id}/findings?limit=${limit}`),
    enabled: !!id && enabled,
    staleTime: 30_000,
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** L02 — the agent's skill links (ordered, with the per-agent `enabled` flag). */
export function useAgentSkills(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", id],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
    enabled: !!id,
  });
}

export interface AgentSkillItem {
  skill_id: string;
  enabled: boolean;
}

/** L02 — full ordered replacement of an agent's skill links (order = index).
 *  Optimistic: the cache is written first and rolled back if the request fails. */
export function useSetAgentSkills(id: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", id];
  return useMutation({
    mutationFn: (items: AgentSkillItem[]) => api.post<AgentSkillLink[]>(`/agents/${id}/skills`, { items }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        items.map((i, order) => ({ agent_id: id, skill_id: i.skill_id, order, enabled: i.enabled })),
      );
      return { previous };
    },
    onError: (_err, _items, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", id] });
      qc.invalidateQueries({ queryKey: SKILLS_KEY });
    },
  });
}
