/* RiskAreas — model-written risks from the PR brief. Title, explanation and refs are model
   output about author-controlled text: rendered as plain text only, never Markdown/HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, Skeleton, type IconName } from "@devdigest/ui";
import type { Risk, RiskRef } from "@devdigest/shared";
import { truncateMiddle, type BriefLinkCtx } from "../../helpers";
import { BriefRefLink } from "../BriefRefLink";
import { SEVERITY_COLOR, kindIcon, refLabel } from "./helpers";
import { s } from "./styles";

function RiskRow({
  risk,
  linkCtx,
  onNavigate,
}: {
  risk: Risk;
  linkCtx: BriefLinkCtx;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const I = Icon[kindIcon(risk.kind)];
  const first = risk.refs[0];
  return (
    <div style={s.item}>
      <button type="button" style={s.row} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <I size={16} style={{ color: SEVERITY_COLOR[risk.severity], flexShrink: 0 }} />
        <span style={s.title}>{risk.title}</span>
        {first && (
          <span className="mono" style={s.ref} title={first.file}>
            {truncateMiddle(refLabel(first), 40)}
          </span>
        )}
        {open ? <Icon.ChevronDown size={14} style={s.chevron} /> : <Icon.ChevronRight size={14} style={s.chevron} />}
      </button>
      {open && (
        <div style={s.details}>
          <p style={{ margin: 0 }}>{risk.explanation}</p>
          <ul style={s.refs}>
            {risk.refs.map((r: RiskRef, i: number) => (
              <li key={`${i}-${r.file}-${r.start_line ?? ""}`}>
                <BriefRefLink file={r.file} line={r.start_line} label={refLabel(r)} ctx={linkCtx} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RiskAreas({
  risks,
  pending,
  linkCtx,
  onNavigate,
}: {
  risks: Risk[] | null;
  pending: boolean;
  linkCtx: BriefLinkCtx;
  onNavigate: (href: string) => void;
}) {
  const t = useTranslations("brief");
  let body: React.ReactNode;
  if (pending) {
    body = (
      <div style={s.skeletons}>
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  } else if (!risks || risks.length === 0) {
    body = <div style={s.muted}>{t("noRisks")}</div>;
  } else {
    body = (
      <div style={s.list}>
        {risks.map((r, i) => (
          <RiskRow key={`${i}-${r.title}`} risk={r} linkCtx={linkCtx} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }
  return (
    <section aria-label={t("block.riskAreas")}>
      <SectionLabel icon={"AlertTriangle" satisfies IconName}>{t("block.riskAreas")}</SectionLabel>
      {body}
    </section>
  );
}
