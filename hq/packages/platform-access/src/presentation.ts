export interface LeaguePresentation {
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly provider: "SLEEPER" | null;
  readonly providerLeagueId: string | null;
  readonly fetchedAt: string | null;
}

export interface TeamSeasonPresentation {
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly provider: "SLEEPER" | null;
  readonly providerRosterId: string | null;
  readonly fetchedAt: string | null;
}

export interface CurrentLeaguePresentation {
  readonly league: LeaguePresentation;
  readonly team: TeamSeasonPresentation;
}

export interface SleeperTeamPresentation {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly source: "LEAGUE_USER_METADATA" | "ROSTER_METADATA" | "CANONICAL_TEAM_SEASON" | "UNAVAILABLE";
}

export function isSafeRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function sleeperAvatarUrl(value: unknown, variant: "thumbs" | "original" = "thumbs"): string | null {
  if (isSafeRemoteImageUrl(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  return `https://sleepercdn.com/avatars/${variant}/${encodeURIComponent(value.trim())}`;
}

function recordMetadata(record: Readonly<Record<string, unknown>> | null): Readonly<Record<string, unknown>> {
  return record && typeof record.metadata === "object" && record.metadata !== null ? record.metadata as Readonly<Record<string, unknown>> : {};
}

function providerId(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function isTechnicalTeamName(value: string, franchiseId?: string | null): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === franchiseId?.trim().toLowerCase() || /(?:^|\s)franchise\s+for\s+roster\s+\d+$/i.test(value) || /^[a-z0-9]+-franchise-\d+$/i.test(normalized);
}

export function currentTeamDisplayName(input: { readonly providerName?: string | null; readonly canonicalName?: string | null; readonly franchiseId?: string | null }): string {
  if (input.providerName?.trim()) return input.providerName.trim();
  if (input.canonicalName?.trim() && !isTechnicalTeamName(input.canonicalName, input.franchiseId)) return input.canonicalName.trim();
  return "Current team name unavailable";
}

export function resolveSleeperTeamPresentation(input: {
  readonly roster: Readonly<Record<string, unknown>> | null;
  readonly leagueUsers: readonly Readonly<Record<string, unknown>>[];
  readonly canonicalName?: string | null;
  readonly franchiseId?: string | null;
}): SleeperTeamPresentation {
  const rosterMetadata = recordMetadata(input.roster);
  const ownerId = providerId(input.roster?.owner_id);
  const owner = ownerId ? input.leagueUsers.find((user) => providerId(user.user_id) === ownerId) ?? null : null;
  const ownerMetadata = recordMetadata(owner);
  const leagueUserName = typeof ownerMetadata.team_name === "string" ? ownerMetadata.team_name : null;
  const rosterName = typeof rosterMetadata.team_name === "string" ? rosterMetadata.team_name : typeof input.roster?.team_name === "string" ? input.roster.team_name : null;
  const displayName = currentTeamDisplayName({ providerName: leagueUserName, canonicalName: rosterName ?? input.canonicalName, franchiseId: input.franchiseId });
  const source = leagueUserName?.trim() ? "LEAGUE_USER_METADATA" : rosterName?.trim() ? "ROSTER_METADATA" : displayName === "Current team name unavailable" ? "UNAVAILABLE" : "CANONICAL_TEAM_SEASON";
  const avatarUrl = sleeperAvatarUrl(ownerMetadata.avatar) ?? sleeperAvatarUrl(rosterMetadata.avatar) ?? sleeperAvatarUrl(input.roster?.avatar);
  return { displayName, avatarUrl, source };
}
