/* BlastRadiusBlock — what else a PR can break (L04): changed symbols, their callers as
   file:line GitHub links, and the endpoints/crons behind them. Repo-derived strings (symbol,
   path, route) are rendered as plain React text only. No limits here: caps live on the server. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastGraph } from "./_components/BlastGraph";
import { blastCounts } from "./helpers";
import { s } from "./styles";

interface BlastRadiusBlockProps {
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string | null;
}

type LinkCtx = { repoFullName: string | null; headSha: string | null };
type View = "tree" | "graph";
const VIEWS: View[] = ["tree", "graph"];

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("view.switchAria")} style={s.viewSwitch}>
      {VIEWS.map((v) => (
        <button key={v} type="button" aria-pressed={view === v} style={s.viewButton(view === v)} onClick={() => onChange(v)}>
          {t(`view.${v}`)}
        </button>
      ))}
    </div>
  );
}

function ChipGroup({ label, items, kind }: { label: string; items: string[]; kind: "endpoint" | "cron" }) {
  if (items.length === 0) return null;
  const isEndpoint = kind === "endpoint";
  return (
    <div role="group" aria-label={label} style={s.chips}>
      {items.map((item) => (
        <Badge
          key={item}
          mono
          icon={isEndpoint ? "Globe" : "Clock"}
          color={isEndpoint ? "var(--accent-text)" : "var(--warn)"}
          bg={isEndpoint ? "var(--accent-bg)" : "var(--warn-bg)"}
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}

function CallerRef({ file, line, name, link }: { file: string; line: number; name: string; link: LinkCtx }) {
  const text = `${file}:${line}`;
  // The caller function name is only a tooltip; the visible text is the location.
  const ref =
    link.repoFullName && link.headSha ? (
      <MonoLink href={githubBlobUrl(link.repoFullName, link.headSha, file, line)}>{text}</MonoLink>
    ) : (
      <span className="mono">{text}</span>
    );
  return (
    <span title={name} style={s.callerRef}>
      <Icon.CornerDownRight size={12} style={s.muted} />
      {ref}
    </span>
  );
}

function SymbolImpact({ impact, open, onToggle, link }: { impact: DownstreamImpact; open: boolean; onToggle: () => void; link: LinkCtx }) {
  const t = useTranslations("blast");
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <div style={s.symbolBox}>
      <button
        type="button"
        style={s.symbolHead}
        aria-expanded={open}
        title={open ? t("collapse", { symbol: impact.symbol }) : t("expand", { symbol: impact.symbol })}
        onClick={onToggle}
      >
        <Chevron size={14} />
        <Icon.Code size={14} style={s.codeIcon} />
        <span className="mono">{`${impact.symbol}()`}</span>
        <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {impact.callers.map((c, i) => (
              <li key={`${i}-${c.file}-${c.line}`} style={s.caller}>
                <CallerRef file={c.file} line={c.line} name={c.name} link={link} />
              </li>
            ))}
          </ul>
          <ChipGroup label={t("endpointsLabel")} items={impact.endpoints_affected} kind="endpoint" />
          <ChipGroup label={t("cronsLabel")} items={impact.crons_affected} kind="cron" />
        </div>
      )}
    </div>
  );
}

function BlastBody({ radius, repoId, link }: { radius: BlastRadius; repoId: string | null; link: LinkCtx }) {
  const t = useTranslations("blast");
  const resync = useResyncRepoIntel(repoId);
  // Symbols the user flipped away from the default (first expanded, rest collapsed).
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>("tree");
  const hasDownstream = radius.downstream.length > 0;
  const counts = blastCounts(radius);
  const stats = [
    ["symbols", counts.symbols, Icon.Code],
    ["callers", counts.callers, Icon.CornerDownRight],
    ["endpoints", counts.endpoints, Icon.Globe],
    ["crons", counts.crons, Icon.Clock],
  ] as const;

  const isOpen = (symbol: string, index: number) => (index === 0) !== flipped.has(symbol);
  const toggle = (symbol: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(symbol)) next.add(symbol);
      return next;
    });

  return (
    <>
      <SectionLabel
        icon="Layers"
        right={
          radius.degraded ? (
            <Button kind="secondary" size="sm" icon="RefreshCw" disabled={resync.isPending} onClick={() => resync.mutate()}>
              {resync.isPending ? t("resyncing") : t("resync")}
            </Button>
          ) : undefined
        }
      >
        <span style={s.headerRow}>
          {t("title")}
          {radius.degraded && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("degraded.badge", { reason: t(`degraded.reason.${radius.reason ?? "no_data"}`) })}
            </Badge>
          )}
        </span>
      </SectionLabel>
      {resync.isSuccess && <p style={s.muted}>{t("resyncStarted")}</p>}

      <div role="group" aria-label={t("summaryAria")} style={s.summaryRow}>
        {stats.map(([key, n, StatIcon]) => (
          <div key={key} style={s.stat}>
            <StatIcon size={14} style={s.muted} />
            <span style={s.statNum}>{n}</span>
            <span style={s.statLabel}>{t(`stat.${key}`)}</span>
          </div>
        ))}
        {hasDownstream && <ViewSwitch view={view} onChange={setView} />}
      </div>

      {!hasDownstream ? (
        <p style={s.muted}>{t("noDownstream", { count: radius.changed_symbols.length })}</p>
      ) : view === "graph" ? (
        <BlastGraph downstream={radius.downstream} />
      ) : (
        <div style={s.symbolList}>
          {radius.downstream.map((d, i) => (
            <SymbolImpact key={d.symbol} impact={d} open={isOpen(d.symbol, i)} onToggle={() => toggle(d.symbol)} link={link} />
          ))}
        </div>
      )}
    </>
  );
}

export function BlastRadiusBlock({ prId, repoId, repoFullName, headSha }: BlastRadiusBlockProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);

  if (isLoading) {
    return (
      <Card>
        <div role="status" aria-label={t("title")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={14} width={140} />
          <Skeleton height={40} />
        </div>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      </Card>
    );
  }
  return (
    <Card>
      <BlastBody radius={data} repoId={repoId} link={{ repoFullName, headSha }} />
    </Card>
  );
}
