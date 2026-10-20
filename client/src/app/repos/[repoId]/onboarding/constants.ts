/* constants.ts — route-level constants for the Onboarding Tour screen. */

/** The five tour sections in spec order. `key` is the i18n key under `sections.*`. */
export const TOUR_SECTIONS = [
  { key: "architecture", anchor: "architecture-overview", titleKey: "sections.architecture" },
  { key: "criticalPaths", anchor: "critical-paths", titleKey: "sections.criticalPaths" },
  { key: "runCommands", anchor: "how-to-run-locally", titleKey: "sections.runCommands" },
  { key: "readingPath", anchor: "guided-reading-path", titleKey: "sections.readingPath" },
  { key: "firstTasks", anchor: "first-tasks", titleKey: "sections.firstTasks" },
] as const;

export type TourSectionKey = (typeof TOUR_SECTIONS)[number]["key"];
export type TourAnchor = (typeof TOUR_SECTIONS)[number]["anchor"];

/** Characters allowed in a Mermaid node label (everything else is dropped). */
export const MERMAID_LABEL_DISALLOWED = /[^A-Za-z0-9 _./@-]/g;
