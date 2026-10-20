/* helpers.ts — pure helpers for the Onboarding Tour screen. */
import type { OnboardingDiagram, OnboardingReason, OnboardingTour, OnboardingTourState, Repo } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { MERMAID_LABEL_DISALLOWED, TOUR_SECTIONS, type TourAnchor, type TourSectionKey } from "./constants";

export { TOUR_SECTIONS };

/** `#architecture-overview` → `architecture-overview`; anything else → null. */
export function isTourAnchor(hash: string): TourAnchor | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return TOUR_SECTIONS.find((s) => s.anchor === raw)?.anchor ?? null;
}

export type TourViewMode =
  | "no_repo"
  | "loading"
  | "load_error"
  | "not_cloned"
  | "empty"
  | "generating"
  | "tour";

export function tourViewMode(input: {
  repoKnown: boolean;
  isLoading: boolean;
  isError: boolean;
  data: OnboardingTourState | undefined;
}): TourViewMode {
  const { repoKnown, isLoading, isError, data } = input;
  if (!repoKnown) return "no_repo";
  if (isError) return "load_error";
  if (isLoading || !data) return "loading";
  if (data.status === "generating") return "generating";
  if (data.tour) return "tour";
  return data.cloned ? "empty" : "not_cloned";
}

export function fileHref(repo: Pick<Repo, "full_name" | "default_branch">, indexSha: string | null, path: string): string {
  return githubBlobUrl(repo.full_name, indexSha ?? repo.default_branch, path);
}

function cleanLabel(label: string, fallback: string): string {
  const cleaned = label.replace(MERMAID_LABEL_DISALLOWED, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

/** Build Mermaid source from the stored diagram. Ids are generated (`n0…`), labels are filtered
 *  and quoted, edges to unknown ids are dropped — model output never reaches the syntax. */
export function diagramToMermaid(diagram: OnboardingDiagram): string {
  const ids = new Map<string, string>();
  const lines = ["graph LR"];
  diagram.nodes.forEach((node, i) => {
    const id = `n${i}`;
    ids.set(node.id, id);
    const label = cleanLabel(node.label, id);
    lines.push(node.kind === "service" ? `  ${id}[("${label}")]` : `  ${id}["${label}"]`);
  });
  for (const edge of diagram.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  return lines.join("\n");
}

const code = (s: string) => `\`${s}\``;

export function tourToMarkdown(
  tour: OnboardingTour,
  opts: {
    repoName: string;
    titles: Record<string, string>;
    reasonLabel: (code: OnboardingReason) => string;
  },
): string {
  const { sections } = tour;
  const out: string[] = [`# Onboarding for ${opts.repoName}`];
  const heading = (key: TourSectionKey) => `## ${opts.titles[key] ?? key}`;
  const unavailable = (reason: OnboardingReason | null) =>
    reason ? `_Unavailable: ${opts.reasonLabel(reason)}_` : null;

  out.push(heading("architecture"));
  const arch = sections.architecture;
  out.push(unavailable(arch.unavailable_reason) ?? arch.narrative);

  out.push(heading("criticalPaths"));
  const cp = sections.critical_paths;
  out.push(
    unavailable(cp.unavailable_reason) ??
      cp.items
        .map((i) => `- ${code(i.path)} — ${i.fact}${i.reason ? `. ${i.reason}` : ""}`)
        .join("\n"),
  );

  out.push(heading("runCommands"));
  const rc = sections.run_commands;
  out.push(
    unavailable(rc.unavailable_reason) ??
      ["```sh", ...rc.items.map((i) => (i.comment ? `${i.command} # ${i.comment}` : i.command)), "```"].join("\n"),
  );

  out.push(heading("readingPath"));
  const rp = sections.reading_path;
  out.push(
    unavailable(rp.unavailable_reason) ??
      rp.items.map((i, n) => `${n + 1}. ${code(i.path)} — ${i.why}`).join("\n"),
  );

  out.push(heading("firstTasks"));
  const ft = sections.first_tasks;
  out.push(
    unavailable(ft.unavailable_reason) ??
      ft.items
        .map((t) => `- **${t.title}** — ${t.description}${t.paths.length ? ` (${t.paths.map(code).join(", ")})` : ""}`)
        .join("\n"),
  );

  return `${out.join("\n\n")}\n`;
}
