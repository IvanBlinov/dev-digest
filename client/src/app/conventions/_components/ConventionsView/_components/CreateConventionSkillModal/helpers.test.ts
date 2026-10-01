import { describe, it, expect } from "vitest";
import { renameBodyHeading } from "./helpers";

describe("renameBodyHeading", () => {
  const body = "# repo-conventions\n\nHouse conventions for `dev-digest`.\n";

  it("follows the skill name while the heading still matches the old name", () => {
    expect(renameBodyHeading(body, "repo-conventions", "dev-digest-conventions")).toBe(
      "# dev-digest-conventions\n\nHouse conventions for `dev-digest`.\n",
    );
  });

  it("leaves a heading the user already changed", () => {
    const edited = "# My own title\n\nbody";
    expect(renameBodyHeading(edited, "repo-conventions", "x-conventions")).toBe(edited);
  });

  it("only touches the first line", () => {
    const twice = "# repo-conventions\n## repo-conventions\n";
    expect(renameBodyHeading(twice, "repo-conventions", "new-name")).toBe("# new-name\n## repo-conventions\n");
  });
});
