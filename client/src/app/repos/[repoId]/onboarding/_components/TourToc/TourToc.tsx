"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TOUR_SECTIONS, isTourAnchor } from "../../helpers";
import { s } from "./styles";

export interface TourTocProps {
  /** Section titles keyed by `TOUR_SECTIONS[i].key`. */
  titles: Record<string, string>;
}

export function TourToc({ titles }: TourTocProps) {
  const t = useTranslations("onboarding");
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const anchor = isTourAnchor(window.location.hash);
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as Element).id;
        if (isTourAnchor(id)) setActive(id);
      }
    });
    for (const section of TOUR_SECTIONS) {
      const el = document.getElementById(section.anchor);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label={t("toc.title")} className="hidden md:block" style={s.nav}>
      <div style={s.label} aria-hidden="true">
        {t("toc.title")}
      </div>
      <ul style={s.list}>
        {TOUR_SECTIONS.map((section) => (
          <li key={section.anchor}>
            <a
              href={`#${section.anchor}`}
              aria-current={active === section.anchor ? "location" : undefined}
              style={active === section.anchor ? s.linkActive : s.link}
            >
              {titles[section.key]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
