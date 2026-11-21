// Long Snap demo: answer Sleeper requests for the made-up leagues from the first server module that loads, so page
// builds (which run before instrumentation.ts) never fetch or cache Sleeper's empty answers for the made-up league IDs.
import "server-only";
import { isDemoMode } from "./demoLeagues.ts";
import { installFakeSleeper } from "./fakeSleeper.ts";

if (isDemoMode()) installFakeSleeper();
