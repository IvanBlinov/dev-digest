import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, screen, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <ToastProvider>{children}</ToastProvider>
    </NextIntlClientProvider>
  );
}

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
  cleanup();
  setClipboard(undefined);
});

describe("useCopyToClipboard", () => {
  it("AC-64: resolves → writeText gets the text and the success toast 'Link copied' shows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { result } = renderHook(() => useCopyToClipboard(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.copy("http://localhost:3000/repos/r1/onboarding", "Link copied");
    });
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/repos/r1/onboarding");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't copy to the clipboard")).toBeNull();
  });

  it("EC-27: rejects → 'Couldn't copy to the clipboard'", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const { result } = renderHook(() => useCopyToClipboard(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.copy("x", "Link copied");
    });
    expect(await screen.findByText("Couldn't copy to the clipboard")).toBeInTheDocument();
    expect(screen.queryByText("Link copied")).toBeNull();
  });

  it("EC-27: no navigator.clipboard → same", async () => {
    setClipboard(undefined);
    const { result } = renderHook(() => useCopyToClipboard(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.copy("x", "Link copied");
    });
    expect(await screen.findByText("Couldn't copy to the clipboard")).toBeInTheDocument();
  });
});
