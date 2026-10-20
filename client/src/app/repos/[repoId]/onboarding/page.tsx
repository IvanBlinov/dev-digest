"use client";

import React from "react";
import { useParams } from "next/navigation";
import { OnboardingTourView } from "./_components/OnboardingTourView";

export default function OnboardingTourPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <OnboardingTourView repoId={repoId} />;
}
