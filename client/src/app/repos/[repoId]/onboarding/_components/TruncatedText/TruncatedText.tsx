"use client";

import React, { useId, useState } from "react";
import { s } from "./styles";

export interface TruncatedTextProps {
  text: string;
  /** Plain text shown in the tooltip; defaults to `text`. */
  tooltip?: string;
  mono?: boolean;
}

/** One-line ellipsised text; hover or keyboard focus reveals the full value as a plain-text tooltip. */
export function TruncatedText({ text, tooltip, mono = false }: TruncatedTextProps) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const full = tooltip ?? text;
  return (
    <span style={s.wrap}>
      <span
        tabIndex={0}
        title={full}
        aria-describedby={open ? tipId : undefined}
        className={mono ? "mono" : undefined}
        style={s.text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {text}
      </span>
      {open ? (
        <span role="tooltip" id={tipId} style={s.tooltip}>
          {full}
        </span>
      ) : null}
    </span>
  );
}
