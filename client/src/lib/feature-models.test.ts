import { describe, it, expect } from "vitest";
import { FEATURE_MODELS as SHARED } from "@devdigest/shared";
import { FEATURE_MODELS } from "./feature-models";

describe("client feature-model registry", () => {
  it("mirrors the shared registry exactly", () => {
    expect(FEATURE_MODELS).toEqual(SHARED);
  });

  it("review_intent defaults to openrouter / openai/gpt-4.1-mini", () => {
    const def = FEATURE_MODELS.find((m) => m.id === "review_intent");
    expect(def?.defaultProvider).toBe("openrouter");
    expect(def?.defaultModel).toBe("openai/gpt-4.1-mini");
  });
});
