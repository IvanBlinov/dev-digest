import { SkillDetail } from "./_components/SkillDetail";

/* Route: /skills/:id — list (from ../layout.tsx) + the selected skill's Config · Preview · Versioning. */
export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: reset tab/draft state when switching between skills.
  return <SkillDetail key={id} id={id} />;
}
