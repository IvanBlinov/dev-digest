import { SkillsLabView } from "./_components/SkillsLabView";

/* Skills Lab layout — the skills list lives here so it stays mounted while the right
   panel switches between /skills (select prompt) and /skills/:id (SkillDetail). */
export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return <SkillsLabView>{children}</SkillsLabView>;
}
