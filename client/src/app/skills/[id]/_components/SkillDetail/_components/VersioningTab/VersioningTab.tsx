/* VersioningTab — skill version history (req 27–29): every version with its note and date, the
   current one marked, older ones with an inline Diff (vs the current body) and a Restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffLines, diffStats } from "@/lib/skill-diff";
import { DATE_FORMAT, DIFF_PREFIX } from "./constants";
import { s } from "./styles";

function VersionDiff({ version, skill }: { version: SkillVersion; skill: Skill }) {
  const t = useTranslations("skills");
  const lines = React.useMemo(() => diffLines(version.body, skill.body), [version.body, skill.body]);
  const stats = diffStats(lines);
  return (
    <div style={s.diffBox}>
      <div style={s.diffCaption}>
        {t("versions.diffCaption", { version: version.version, current: skill.version, ...stats })}
      </div>
      {stats.added + stats.removed === 0 && <div style={s.diffCaption}>{t("versions.noChanges")}</div>}
      {lines.map((l, i) => (
        <div key={i} className="mono" data-diff={l.kind} style={s.diffLine(l.kind)}>
          {DIFF_PREFIX[l.kind] + l.text}
        </div>
      ))}
    </div>
  );
}

export function VersioningTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [openVersion, setOpenVersion] = React.useState<number | null>(null);

  const doRestore = (from: number) =>
    restore.mutate(
      { id: skill.id, version: from },
      {
        onSuccess: (saved) => {
          setOpenVersion(null);
          toast.success(t("versions.restored", { from, version: saved.version }));
        },
        onError: (e) => toast.error(t("versions.restoreFailed", { message: e.message })),
      },
    );

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={140} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const list = versions ?? [];
  return (
    <div style={s.wrap}>
      <div style={s.heading}>{t("versions.heading", { count: list.length })}</div>
      {list.length === 0 ? (
        <div style={s.date}>{t("versions.empty")}</div>
      ) : (
        <div style={s.list}>
          {list.map((v, i) => {
            const current = v.version === skill.version;
            const open = openVersion === v.version;
            return (
              <div key={v.version}>
                <div style={s.row(i === 0)}>
                  <span className="mono" style={s.version}>
                    v{v.version}
                  </span>
                  <span style={s.message}>{v.message || t("versions.noMessage")}</span>
                  <span className="tnum" style={s.date}>
                    {new Date(v.created_at).toLocaleString(undefined, DATE_FORMAT)}
                  </span>
                  {current ? (
                    <span style={s.current}>{t("versions.current")}</span>
                  ) : (
                    <>
                      <Button kind="ghost" size="sm" onClick={() => setOpenVersion(open ? null : v.version)}>
                        {open ? t("versions.hideDiff") : t("versions.diff")}
                      </Button>
                      <Button
                        kind="secondary"
                        size="sm"
                        icon="History"
                        onClick={() => doRestore(v.version)}
                        disabled={restore.isPending}
                      >
                        {t("versions.restore")}
                      </Button>
                    </>
                  )}
                </div>
                {open && !current && <VersionDiff version={v} skill={skill} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
