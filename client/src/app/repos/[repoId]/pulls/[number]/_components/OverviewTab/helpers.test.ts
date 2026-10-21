import { describe, it, expect } from "vitest";
import { briefLinkFor, truncateMiddle } from "./helpers";

const ctx = {
  changedFiles: new Set(["src/a.ts", "src/my file.ts"]),
  repoFullName: "acme/api",
  headSha: "abc123",
};

describe("briefLinkFor", () => {
  it("AC-43 / AC-45: a changed file links to Files changed, with the line when there is one", () => {
    expect(briefLinkFor("src/a.ts", 12, ctx)).toEqual({ kind: "diff", href: "?tab=diff&file=src%2Fa.ts&line=12" });
    expect(briefLinkFor("src/a.ts", null, ctx)).toEqual({ kind: "diff", href: "?tab=diff&file=src%2Fa.ts" });
  });

  it("AC-43 / EC-24: a blast-only file links to GitHub at the head SHA, with #L<line>", () => {
    const link = briefLinkFor("src/c.ts", 12, ctx);
    expect(link).toEqual({ kind: "github", href: "https://github.com/acme/api/blob/abc123/src/c.ts#L12" });
    const noLine = briefLinkFor("src/c.ts", null, ctx);
    expect(noLine).toEqual({ kind: "github", href: "https://github.com/acme/api/blob/abc123/src/c.ts" });
  });

  it("AC-43: a blast-only file with an unknown owner/name is plain text", () => {
    expect(briefLinkFor("src/c.ts", 12, { ...ctx, repoFullName: null })).toEqual({ kind: "text" });
  });

  it("security: the path is percent-encoded per segment in both link kinds", () => {
    const diff = briefLinkFor("src/my file.ts", 3, ctx);
    expect(diff).toEqual({ kind: "diff", href: "?tab=diff&file=src%2Fmy%20file.ts&line=3" });
    const gh = briefLinkFor("lib/a b/c#d.ts", 1, ctx);
    expect(gh.kind).toBe("github");
    expect((gh as { href: string }).href).toBe("https://github.com/acme/api/blob/abc123/lib/a%20b/c%23d.ts#L1");
  });
});

describe("truncateMiddle", () => {
  it("EC-21: leaves short text alone", () => {
    expect(truncateMiddle("src/a.ts", 40)).toBe("src/a.ts");
  });

  it("EC-21: cuts a long path in the middle, keeping both ends within the max", () => {
    const long = "packages/payments/src/middleware/rate-limiting/token-bucket/limiter.ts";
    const out = truncateMiddle(long, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toMatch(/…|\.\.\./);
    expect(out.startsWith("packages")).toBe(true);
    expect(out.endsWith("limiter.ts")).toBe(true);
  });
});
