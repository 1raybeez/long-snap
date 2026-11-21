import type { CanonicalPlayer, ProviderPlayerMapping } from "../../player-identity/src/types.ts";
import type { CacheResource, CacheScope } from "../../provider-cache/src/types.ts";
import type { FranchiseRecord, LeagueMembershipRecord, OwnerProviderIdentity, OwnerRecord, TeamSeasonRecord } from "../../owner-identity/src/types.ts";
import type { IntelligenceMetricKind, IntelligenceFreshness } from "../../fantasy-intelligence/src/types.ts";
import type { OwnerEvidence, OwnerPreferenceProfile } from "../../trade-war-room/src/owner-preference-types.ts";
import type { PayloadReference } from "./payload-ref.ts";

export type SourceOfTruth = "STATIC_CONFIG" | "CANONICAL_RECORD" | "DERIVED_CACHE" | "HISTORICAL_SNAPSHOT" | "CURATED_HISTORY" | "APPEND_ONLY_LEDGER" | "GENERATED_DERIVED_STATE";
export interface PersistenceMetadata { readonly schemaVersion: number; readonly sourceOfTruth: SourceOfTruth; readonly version: number; readonly createdAt: string; readonly updatedAt: string; }
export type Persisted<T> = T & PersistenceMetadata;

export type PersistedOwner = Persisted<OwnerRecord>;
export interface OwnerProviderMappingRecord extends PersistenceMetadata { readonly mappingId: string; readonly ownerId: string; readonly identity: OwnerProviderIdentity; }
export type PersistedMembership = Persisted<LeagueMembershipRecord>;
export type PersistedFranchise = Persisted<FranchiseRecord>;
export type PersistedTeamSeason = Persisted<TeamSeasonRecord>;
export type PersistedPlayer = Persisted<CanonicalPlayer>;
export interface PlayerProviderMappingRecord extends PersistenceMetadata { readonly mappingId: string; readonly hqPlayerId: string; readonly mapping: ProviderPlayerMapping; }

export interface ProviderCacheRecord extends PersistenceMetadata {
  readonly key: string; readonly provider: string; readonly resource: CacheResource; readonly scope: CacheScope;
  readonly fetchedAt: string; readonly expiresAt: string; readonly freshness: "FRESH" | "STALE" | "MISS";
  readonly payloadRef: PayloadReference; readonly lastSuccessfulSync: string | null; readonly lastAttemptedSync: string | null;
  readonly error: { readonly code: string; readonly message: string; readonly retryable: boolean } | null;
}

export interface IntelligenceSnapshotRecord extends PersistenceMetadata {
  readonly snapshotId: string; readonly provider: string; readonly metric: IntelligenceMetricKind;
  readonly canonicalAssetRef: string; readonly observedAt: string; readonly appliesToSeason: number;
  readonly freshness: IntelligenceFreshness; readonly provenance: string; readonly payloadRef: PayloadReference;
  readonly checksum?: string; readonly observationIds: readonly string[];
}
export interface IntelligenceLatestIndex extends PersistenceMetadata { readonly indexKey: string; readonly snapshotId: string; readonly provider: string; readonly metric: IntelligenceMetricKind; readonly canonicalAssetRef: string; readonly season: number; }

export interface SavedTradeAnalysis extends PersistenceMetadata {
  readonly analysisId: string; readonly requestingAccountId: string; readonly leagueId: string; readonly season: number;
  readonly objectiveAnalysisRef: string; readonly userLabel?: string; readonly userNote?: string;
  readonly ownerPreferenceOverlayRef?: string;
}

export interface OwnerPreferenceEvidenceRecord extends PersistenceMetadata {
  readonly evidence: OwnerEvidence; readonly evidenceVersion: number; readonly supersedesEvidenceId?: string; readonly correctionReason?: string;
}
export interface DerivedOwnerPreferenceProfileRecord extends PersistenceMetadata {
  readonly profile: OwnerPreferenceProfile; readonly sourceEvidenceVersion: number; readonly generatedAt: string; readonly stale: boolean; readonly rebuildable: true;
}

export interface AuditEventRecord extends PersistenceMetadata {
  readonly eventId: string; readonly eventType: string; readonly actorAccountId?: string; readonly entityType: string; readonly entityId: string;
  readonly occurredAt: string; readonly source: string; readonly reason?: string; readonly provenance?: string; readonly correlationId?: string;
  readonly changeSummary?: string; readonly beforeRef?: string; readonly afterRef?: string;
}
