/* RunStatus — live SSE status for in-flight review runs. One collapsible section per agent
   (expand to see that agent's own log) plus a "Preparation" section for the lines shared by
   every agent (diff loading). A single-agent run is expanded by default. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRunEvents } from "../../../../../../../lib/hooks/reviews";
import { LogSection } from "./_components/LogSection";
import { groupRunLog, type LiveRun } from "./helpers";
import { s } from "./styles";

export function RunStatus({ runs, onDone }: { runs: LiveRun[]; onDone?: () => void }) {
  const t = useTranslations("prReview");
  const runIds = React.useMemo(() => runs.map((r) => r.runId), [runs]);
  const { events, running, openRunIds } = useRunEvents(runIds);
  const wasRunning = React.useRef(false);

  React.useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) onDone?.();
  }, [running, onDone]);

  if (runs.length === 0) return null;

  const { shared, agents } = groupRunLog(events, runs, new Set(openRunIds ?? []));
  const single = agents.length === 1;

  return (
    <div style={s.wrap}>
      {running && <div style={s.summary}>{t("runStatus.elapsed", { count: runs.length })}</div>}
      {shared.length > 0 && (
        <LogSection title={t("runStatus.section.preparation")} lines={shared} last={shared.at(-1) ?? null} />
      )}
      {agents.map((a) => (
        <LogSection
          key={a.runId}
          title={a.agentName}
          lines={a.lines}
          status={a.status}
          last={a.last}
          defaultOpen={single}
        />
      ))}
    </div>
  );
}
