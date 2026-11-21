import type { CandidateOffer } from "./candidate-types.ts";
import type { OwnerId } from "../../owner-identity/src/types.ts";

export type OwnerEvidenceKind = "EXPLICIT_OWNER_STATEMENT" | "CURRENT_ROSTER_CONTEXT" | "COMPLETED_TRADE_OBSERVATION" | "ACCEPTED_OFFER_OBSERVATION" | "REJECTED_OFFER_OBSERVATION" | "MANUAL_COMMISSIONER_NOTE";
export type EvidenceBasis = "EXPLICIT" | "ROSTER_DERIVED" | "OBSERVED_PATTERN" | "MANUAL";
export type EvidenceStrength = "DIRECT" | "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT";
export type EvidenceRecency = "CURRENT" | "RECENT" | "STALE" | "HISTORICAL";
export type PreferenceDirection = "PREFERS" | "AVOIDS" | "UNKNOWN";
export type OwnerProfileState = "ACTIVE" | "STALE" | "INSUFFICIENT_DATA" | "DISABLED";
export type OwnerPreferenceDimension =
  | "CURRENT_PRODUCTION"
  | "YOUTH"
  | "DRAFT_CAPITAL"
  | "STAR_CONCENTRATION"
  | "DEPTH"
  | "POSITIONAL_NEED"
  | "CONTENDER_ASSETS"
  | "REBUILD_ASSETS"
  | "ONE_FOR_ONE_STRUCTURE"
  | "PACKAGE_STRUCTURE"
  | "PICK_INTEREST"
  | "PICK_AVERSION"
  | "KEEPER_VALUE"
  | "AUCTION_VALUE";
export type StrategicHorizon = "CONTEND_NOW" | "BALANCED" | "RETOOL" | "REBUILD";

export interface StructuredPreferenceObservation {
  readonly dimension: OwnerPreferenceDimension;
  readonly direction: PreferenceDirection;
  readonly subject?: string;
  readonly strategicHorizon?: StrategicHorizon;
}

export interface OwnerEvidence {
  readonly evidenceId: string;
  readonly ownerId: OwnerId | string;
  readonly leagueId: string;
  readonly season: number;
  readonly kind: OwnerEvidenceKind;
  readonly basis: EvidenceBasis;
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly recency: EvidenceRecency;
  readonly strength: EvidenceStrength;
  readonly structuredObservation?: StructuredPreferenceObservation;
  readonly note?: string;
  readonly expiresAt?: string;
}

export interface DerivedOwnerPreference {
  readonly dimension: OwnerPreferenceDimension;
  readonly direction: PreferenceDirection;
  readonly basis: "EXPLICIT" | "INFERRED" | "ROSTER_DERIVED" | "MANUAL";
  readonly strength: EvidenceStrength;
  readonly evidenceIds: readonly string[];
  readonly recency: EvidenceRecency;
  readonly explanation: string;
}

export interface OwnerPreferenceProfile {
  readonly profileId: string;
  readonly ownerId: OwnerId | string;
  readonly leagueId: string;
  readonly season: number;
  readonly profileState: OwnerProfileState;
  readonly evidence: readonly OwnerEvidence[];
  readonly derivedPreferences: readonly DerivedOwnerPreference[];
  readonly rosterContextRef?: string;
  readonly lastUpdated: string;
  readonly profileVersion: string;
}

export interface RecencyConfig {
  readonly currentSeason: number;
  readonly recentSeasonOffset?: number;
  readonly staleSeasonOffset?: number;
}

export interface OwnerPreferenceOverlayRequest {
  readonly ownerId: OwnerId | string;
  readonly ownerSide: "SIDE_A" | "SIDE_B";
  readonly profile: OwnerPreferenceProfile;
  readonly candidate: CandidateOffer;
}

export type OfferStructureSuggestionType = "HIGHLIGHT_CURRENT_PRODUCTION" | "HIGHLIGHT_YOUTH" | "HIGHLIGHT_DRAFT_CAPITAL" | "HIGHLIGHT_POSITIONAL_HELP" | "PREFER_ONE_FOR_ONE" | "PREFER_PACKAGE" | "LEAD_WITH_KEEPER_CONTEXT" | "AVOID_UNSUPPORTED_ANGLE";

export interface OfferStructureSuggestion {
  readonly type: OfferStructureSuggestionType;
  readonly explanation: string;
  readonly basis: "EXPLICIT" | "INFERRED" | "ROSTER_DERIVED" | "MANUAL";
  readonly strength: EvidenceStrength;
  readonly evidenceIds: readonly string[];
}

export interface OwnerPreferenceOverlay {
  readonly candidateId: string;
  readonly status: "GUIDANCE_AVAILABLE" | "LIMITED_GUIDANCE" | "NO_GUIDANCE" | "UNSUPPORTED";
  readonly relevantPreferences: readonly DerivedOwnerPreference[];
  readonly evidenceIds: readonly string[];
  readonly structureSuggestions: readonly OfferStructureSuggestion[];
  readonly assetsLikelyMoreRelevant: readonly string[];
  readonly assetsLikelyLessRelevant: readonly string[];
  readonly cautions: readonly string[];
  readonly objectiveAnalysisReference: {
    readonly analysisStatus: CandidateOffer["analysis"]["status"];
    readonly leagueId: string;
    readonly season: number;
  };
  readonly explanation: string;
}
