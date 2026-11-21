import { redirect } from "next/navigation";
import { LongSnapLanding } from "./longsnap-landing";
import { isDemoMode } from "@/lib/demo/demoLeagues";
import { platformLeagues } from "@/lib/platformLeagues";

export const dynamic = "force-dynamic";

/** The public demo shows the Long Snap front page; a league's own site opens on its league. */
export default function HomePage() {
  if (isDemoMode()) return <LongSnapLanding />;
  const first = platformLeagues()[0];
  if (first) redirect(`/${first.slug}`);
  return <main style={{ padding: 40, fontFamily: "system-ui" }}><h1>Long Snap</h1><p>No league is set up yet.</p></main>;
}
