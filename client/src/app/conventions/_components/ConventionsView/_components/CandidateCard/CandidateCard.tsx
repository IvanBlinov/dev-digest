/* CandidateCard — one detected convention (req 46, 47, 49): italic rule (click to rename), category chip, evidence
   block, confidence bar; right column Accept/Accepted · Reject · Edit. Edit swaps the card body
   for an inline form in place. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate, UpdateConventionBody } from "@devdigest/shared";
import { useUpdateConvention } from "@/lib/hooks/conventions";
import { CandidateEditForm } from "./_components/CandidateEditForm";
import { EvidenceBlock } from "./_components/EvidenceBlock";
import { RuleTitle } from "./_components/RuleTitle";
import { confidenceColor, confidencePercent, evidenceLabel } from "./helpers";
import { s } from "./styles";

export interface CandidateCardProps {
  repoId: string;
  candidate: ConventionCandidate;
}

export function CandidateCard({ repoId, candidate: c }: CandidateCardProps) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);
  const [editing, setEditing] = React.useState(false);
  const accepted = c.status === "accepted";

  const send = (patch: UpdateConventionBody, onDone?: () => void) =>
    update.mutate({ id: c.id, patch }, { onSuccess: () => onDone?.() });

  if (editing) {
    return (
      <article style={s.card(accepted)}>
        <CandidateEditForm
          candidate={c}
          saving={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={(patch) => send(patch, () => setEditing(false))}
        />
      </article>
    );
  }

  const pct = confidencePercent(c.confidence);
  const color = confidenceColor(c.confidence);

  return (
    <article style={s.card(accepted)}>
      <div style={s.main}>
        <div style={s.meta}>
          <Badge mono>{t(`categories.${c.category}`)}</Badge>
          {c.edited && <Badge color="var(--text-muted)">{t("card.edited")}</Badge>}
        </div>
        <RuleTitle rule={c.rule} disabled={update.isPending} onSave={(rule) => send({ rule })} />
        <EvidenceBlock location={evidenceLabel(c)} snippet={c.evidence_snippet} />
        <div style={s.confidence}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.bar}>
            <ProgressBar value={pct} color={color} height={5} />
          </div>
          <span className="mono tnum" style={{ ...s.pct, color }}>
            {pct}%
          </span>
        </div>
      </div>
      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          aria-pressed={accepted}
          style={accepted ? s.acceptedBtn : undefined}
          onClick={() => send({ status: accepted ? "pending" : "accepted" })}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="danger" size="sm" icon="X" onClick={() => send({ status: "rejected" })}>
          {t("card.reject")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
