import type { CSSProperties, ReactNode } from "react";
import { themeCssVariables, type LeagueTileTheme } from "./themes.ts";
import { SectionTabs } from "./section-tabs.tsx";

export interface DraftPageFeature { readonly kicker: string; readonly title: string; readonly line: string; readonly href: string; readonly cta?: string }

export function DraftPageFrame({
  theme, leagueName, line, feature, tabs, backHref = "/league-info", children,
}: {
  readonly theme: LeagueTileTheme;
  readonly leagueName: string;
  readonly line: string;
  readonly feature?: DraftPageFeature | null;
  readonly tabs: readonly { readonly id: string; readonly label: string }[];
  readonly backHref?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="league-tiles dp" style={themeCssVariables(theme) as CSSProperties}>
      <header className="hh-hero dp-hero">
        <a className="dp-back" href={backHref}>← League Info</a>
        <p className="hh-hero-eyebrow">{leagueName} · League Info</p>
        <h1>Draft</h1>
        <p>{line}</p>
        {feature ? (
          <a className="dp-feature" href={feature.href}>
            <span><span className="dp-feature-kicker">{feature.kicker}</span><span className="dp-feature-title">{feature.title}</span><span className="dp-feature-line">{feature.line}</span></span>
            <span className="dp-feature-cta">{feature.cta ?? "Read it"} →</span>
          </a>
        ) : null}
      </header>
      <div className="dt-tabs">
        <SectionTabs label="Draft sections" targetId="draft-panels" tabs={tabs} />
      </div>
      <div id="draft-panels">{children}</div>
    </div>
  );
}

export function DraftPanel({ id, intro, action, first = false, children }: { readonly id: string; readonly intro: string; readonly action?: ReactNode; readonly first?: boolean; readonly children: ReactNode }) {
  return (
    <section data-tab={id} hidden={!first} aria-label={id}>
      <div className="dp-intro-row">
        <p className="dt-panel-intro">{intro}</p>
        {action}
      </div>
      {children}
    </section>
  );
}
