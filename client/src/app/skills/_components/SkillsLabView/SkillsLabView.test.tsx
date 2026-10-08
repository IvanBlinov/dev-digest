import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const push = vi.fn();
let params: { id?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => params,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LIST: Skill[] = [
  { id: "a", name: "api-contract-guard", description: "Breaking routes", type: "security", source: "imported", body: "", enabled: true, version: 2, agent_count: 1 },
  { id: "b", name: "test-quality", description: "Edge cases", type: "rubric", source: "manual", body: "", enabled: false, version: 1, agent_count: 0 },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: LIST, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewSkillImport: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillUrlImportPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillFromUrl: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsLabView } from "./SkillsLabView";

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  params = {};
});

function setup() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <SkillsLabView>
          <div>detail-panel</div>
        </SkillsLabView>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsLabView", () => {
  it("renders the list of skill cards next to the detail panel", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("detail-panel")).toBeInTheDocument();
  });

  it("filters by name or description", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "edge" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("test-quality")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "zzz" } });
    expect(screen.getByText("No skills match “zzz”.")).toBeInTheDocument();
  });

  it("clicking a card navigates to /skills/:id and the selected card is highlighted", () => {
    params = { id: "b" };
    setup();
    fireEvent.click(screen.getByText("api-contract-guard"));
    expect(push).toHaveBeenCalledWith("/skills/a");
    const current = screen.getAllByRole("listitem").filter((el) => el.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("test-quality");
  });

  it("Add Skill offers Create and Import; Create opens the modal", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    expect(screen.getByRole("button", { name: "Import from file" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Skill body (Markdown)")).toBeInTheDocument();
  });

  it("Import opens the import modal", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import from file" }));
    expect(screen.getByLabelText("Skill file (.md or .zip)")).toBeInTheDocument();
  });

  it("Add Skill lists Import from URL between Create and Import from file", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    const create = screen.getByRole("button", { name: "Create skill" });
    const fromUrl = screen.getByRole("button", { name: "Import from URL" });
    const fromFile = screen.getByRole("button", { name: "Import from file" });
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(create, fromUrl)).toBe(true);
    expect(follows(fromUrl, fromFile)).toBe(true);
  });

  it("Import from URL opens the URL import modal", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    expect(screen.getByLabelText("Skill URL")).toBeInTheDocument();
  });
});
