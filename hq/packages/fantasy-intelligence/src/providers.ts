import type { IntelligenceMetricKind, IntelligenceProviderDefinition } from "./types.ts";

const MARKET_CATEGORIES: readonly IntelligenceMetricKind[] = ["ADP", "AUCTION_VALUE", "DYNASTY_PLAYER_VALUE", "DYNASTY_PICK_VALUE", "REDRAFT_PLAYER_VALUE", "RANKING", "OVERALL_RANK", "POSITIONAL_RANK", "PROJECTION", "INJURY_STATUS", "DRAFT_RANK", "POSITION_RANK", "TIER"];

export const INTELLIGENCE_PROVIDERS = [
  {
    provider: "FANTASYCALC",
    displayName: "FantasyCalc",
    status: "APPROVED",
    attributionRequired: true,
    republishAllowed: false,
    supportedCategories: MARKET_CATEGORIES,
    supportedFormats: ["DYNASTY", "AUCTION", "KEEPER", "ROOKIE"],
    sourceMethod: "FIXTURE_ONLY",
    attribution: { displayName: "FantasyCalc", url: "https://fantasycalc.com", text: "FantasyCalc market values" },
    termsNote: "Documented private, free, non-commercial use with attribution/link; no dataset republication.",
    useCaseNote: "Approved only for Ray's documented private, free, non-commercial league use case as an input to Ray's own models; attribute and link back.",
  },
  {
    provider: "FANTASYPROS",
    displayName: "FantasyPros",
    status: "PENDING_REVIEW",
    attributionRequired: false,
    republishAllowed: false,
    supportedCategories: ["ADP", "RANKING", "PROJECTION", "INJURY_STATUS"],
    supportedFormats: ["DYNASTY", "REDRAFT", "ROOKIE"],
    sourceMethod: "PENDING_REVIEW",
    useCaseNote: "Referenced as a potential provider only; licensing and permitted access remain unresolved.",
  },
  {
    provider: "ROTOWIRE",
    displayName: "RotoWire",
    status: "PENDING_REVIEW",
    attributionRequired: false,
    republishAllowed: false,
    supportedCategories: ["ADP", "RANKING", "PROJECTION", "INJURY_STATUS"],
    supportedFormats: ["DYNASTY", "REDRAFT", "ROOKIE"],
    sourceMethod: "PENDING_REVIEW",
    useCaseNote: "Referenced as a potential provider only; licensing and permitted access remain unresolved.",
  },
  {
    provider: "DRAFTSHARKS",
    displayName: "DraftSharks",
    status: "PENDING_REVIEW",
    attributionRequired: false,
    republishAllowed: false,
    supportedCategories: ["ADP", "RANKING", "PROJECTION", "INJURY_STATUS"],
    supportedFormats: ["DYNASTY", "REDRAFT", "ROOKIE"],
    sourceMethod: "PENDING_REVIEW",
    useCaseNote: "Referenced as a potential provider only; licensing and permitted access remain unresolved.",
  },
  {
    provider: "INTERNAL",
    displayName: "HQ Internal",
    status: "INTERNAL",
    attributionRequired: false,
    republishAllowed: true,
    supportedCategories: MARKET_CATEGORIES,
    supportedFormats: ["DYNASTY", "REDRAFT", "AUCTION", "KEEPER", "ROOKIE"],
    sourceMethod: "INTERNAL",
    useCaseNote: "Reserved for HQ-derived or manually curated observations with their own provenance.",
  },
  {
    provider: "OTHER",
    displayName: "Other provider",
    status: "PENDING_REVIEW",
    attributionRequired: false,
    republishAllowed: false,
    supportedCategories: MARKET_CATEGORIES,
    supportedFormats: ["DYNASTY", "REDRAFT", "AUCTION", "KEEPER", "ROOKIE"],
    sourceMethod: "PENDING_REVIEW",
    useCaseNote: "Placeholder for a separately reviewed provider; no ingestion is enabled.",
  },
] as const satisfies readonly IntelligenceProviderDefinition[];

export function getIntelligenceProvider(provider: string): IntelligenceProviderDefinition | null {
  return INTELLIGENCE_PROVIDERS.find((definition) => definition.provider === provider) ?? null;
}
