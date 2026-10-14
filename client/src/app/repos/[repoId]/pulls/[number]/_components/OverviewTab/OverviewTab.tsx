"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { BlastRadiusBlock } from "./_components/BlastRadiusBlock";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoId: string | null;
  repoFullName: string | null;
  headSha: string | null;
}

export function OverviewTab({ prBody, prId, repoId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          {/* Author-controlled text: raw HTML is skipped and javascript: links are dropped. */}
          <div style={s.descriptionBox}>
            <Markdown skipHtml>{prBody}</Markdown>
          </div>
        </section>
      )}
      <BlastRadiusBlock prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
    </>
  );
}
