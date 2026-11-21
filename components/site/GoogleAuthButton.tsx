// Platform stand-in for the league sites' Google button (the shared pages import it). Sign-in on the platform is on My Leagues.
export function GoogleAuthButton({ className }: { mode?: string; returnTo?: string; className?: string }) {
  return <a href="/" className={className}>Sign in</a>;
}
