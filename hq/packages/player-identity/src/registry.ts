import type { CanonicalPlayer } from "./types.ts";

export const HQ_PLAYER_FIXTURES = [
  {
    hqPlayerId: "player.patrick-mahomes",
    displayName: "Patrick Mahomes",
    firstName: "Patrick",
    lastName: "Mahomes",
    position: "QB",
    nflTeam: "KC",
    status: "ACTIVE",
    playerType: "PLAYER",
    aliases: ["Patrick Mahomes II"],
    providerMappings: [
      { provider: "SLEEPER", providerPlayerId: "fixture-sleeper-patrick-mahomes", status: "CONFIRMED", sourceRef: "fixture" },
      { provider: "FANTASYCALC", providerPlayerId: "fixture-fantasycalc-patrick-mahomes", status: "CONFIRMED", sourceRef: "fixture" },
    ],
  },
  {
    hqPlayerId: "player.bijan-robinson",
    displayName: "Bijan Robinson",
    firstName: "Bijan",
    lastName: "Robinson",
    position: "RB",
    nflTeam: "ATL",
    status: "ACTIVE",
    playerType: "PLAYER",
    aliases: [],
    providerMappings: [
      { provider: "SLEEPER", providerPlayerId: "fixture-sleeper-bijan-robinson", status: "CONFIRMED", sourceRef: "fixture" },
      { provider: "FANTASYCALC", providerPlayerId: "fixture-fantasycalc-bijan-robinson", status: "CONFIRMED", sourceRef: "fixture" },
    ],
  },
  {
    hqPlayerId: "player.denver-defense",
    displayName: "Denver Broncos",
    firstName: null,
    lastName: null,
    position: "DST",
    nflTeam: "DEN",
    status: "ACTIVE",
    playerType: "DEFENSE",
    aliases: ["Denver Broncos D/ST", "Denver Broncos DEF"],
    providerMappings: [
      { provider: "SLEEPER", providerPlayerId: "fixture-sleeper-denver-defense", status: "CONFIRMED", sourceRef: "fixture" },
    ],
  },
  {
    hqPlayerId: "player.justin-tucker",
    displayName: "Justin Tucker",
    firstName: "Justin",
    lastName: "Tucker",
    position: "K",
    nflTeam: "BAL",
    status: "UNKNOWN",
    playerType: "PLAYER",
    aliases: [],
    providerMappings: [
      { provider: "SLEEPER", providerPlayerId: "fixture-sleeper-justin-tucker", status: "CONFIRMED", sourceRef: "fixture" },
    ],
  },
] as const satisfies readonly CanonicalPlayer[];
