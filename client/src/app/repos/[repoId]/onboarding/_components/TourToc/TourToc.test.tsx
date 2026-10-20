import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { TOUR_SECTIONS } from "../../helpers";
import { TourToc } from "./TourToc";

const TITLE_BY_ANCHOR: Record<string, string> = {
  "architecture-overview": "Architecture overview",
  "critical-paths": "Critical paths",
  "how-to-run-locally": "How to run locally",
  "guided-reading-path": "Guided reading path",
  "first-tasks": "First tasks",
};
/** `titles` is keyed by TOUR_SECTIONS[i].key. */
const TITLES = Object.fromEntries(TOUR_SECTIONS.map((s) => [s.key, TITLE_BY_ANCHOR[s.anchor]!]));

type IoCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let ioCallbacks: IoCallback[] = [];
class FakeIntersectionObserver {
  constructor(cb: IoCallback) {
    ioCallbacks.push(cb);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const scrollIntoView = vi.fn();

/** The page sections the TOC points at (ids = anchors), rendered next to the nav. */
function ui() {
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <TourToc titles={TITLES} />
      {TOUR_SECTIONS.map((s) => (
        <section key={s.anchor} id={s.anchor}>
          body
        </section>
      ))}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  ioCallbacks = [];
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("TourToc", () => {
  it("AC-55: five links in spec order with the five hrefs, inside the 'On this page' nav", () => {
    render(ui());
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(TOUR_SECTIONS.map((s) => `#${s.anchor}`));
    expect(links.map((a) => a.textContent)).toEqual(TOUR_SECTIONS.map((s) => TITLE_BY_ANCHOR[s.anchor]));
  });

  it("AC-55: an intersecting #how-to-run-locally → that link has aria-current 'location'", () => {
    render(ui());
    expect(ioCallbacks.length).toBeGreaterThan(0);
    act(() => {
      for (const cb of ioCallbacks) {
        cb([
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target: document.getElementById("how-to-run-locally")!,
          },
        ]);
      }
    });
    expect(screen.getByRole("link", { name: "How to run locally" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Critical paths" })).not.toHaveAttribute("aria-current");
  });

  it("AC-55: hash '#first-tasks' → scrollIntoView called once on #first-tasks", () => {
    window.location.hash = "#first-tasks";
    render(ui());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("first-tasks"));
  });

  it("AC-55: hash '#evil' → scrollIntoView not called", () => {
    window.location.hash = "#evil";
    render(ui());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("No IntersectionObserver → no throw", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(() => render(ui())).not.toThrow();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
  });

  it("EC-25: nav carries `hidden md:block`", () => {
    render(ui());
    expect(screen.getByRole("navigation", { name: "On this page", hidden: true })).toHaveClass("hidden", "md:block");
  });
});
