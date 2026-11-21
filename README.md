# Long Snap

**A free league website for your Sleeper fantasy football league.** Standings seeded your way, matchups, power rankings, playoff odds, weekly recaps, league history, owner pages, rivalries and records, draft boards, a rule book your owners vote on, a trade veto log and GM tools for every owner.

- **Free.** No paid plan.
- **Yours.** Each commissioner runs their own copy on their own free accounts. Nobody else holds your league's data.
- **No code.** Every setting is a form. The setup guide has a picture for every click.
- **Sleeper first.** ESPN, Yahoo and MyFantasyLeague come later.

## See it first

The public demo has four made-up leagues, one per league type: **Redraft** (Lakeview FFL), **Keeper** (Mill Creek FFL), **Auction keeper** (Harbor City FFL) and **Dynasty** (Ironworks Dynasty, a keeper league until 2021). The teams, owners and votes are invented. The scores are real: every lineup was scored from real NFL games using Sleeper's public stats.

## Editions

| | Basic | Full |
|---|---|---|
| What you get | Everything that only needs Sleeper | Adds owner sign-in, the rule book and votes, the veto log, dues and GM tools |
| Hosting | Your free Vercel account | Vercel plus a free Firebase project |
| Cost | $0 | $0 |

## Get your own site

Go to **[long-snap.vercel.app/get-started/setup](https://long-snap.vercel.app/get-started/setup)**, paste your Sleeper league ID, answer your house rules, and click **Deploy to Vercel**. The step-by-step guide, with a picture for every click, is in [`docs/GUIDE.md`](docs/GUIDE.md).

Today's edition (Basic) gives your league the dashboard, matchups, standings seeded your way, power rankings, playoff odds, weekly recaps, trades and GM tools. League history pages, the rule book and votes, and the veto log for your own league are coming next.

## Run the demo yourself

1. Import this repository into Vercel.
2. Click **Deploy**. Nothing else to set: the demo leagues are on by default.


## For developers

```
npm install
npm run dev       # the demo leagues at http://localhost:3000
npm run build
```

The demo leagues live in `data/demo/`. While the demo is on (the default; set `LONGSNAP_DEMO=0` to turn it off), the server answers Sleeper API requests for those leagues from these files (`lib/demo/fakeSleeper.ts`), so every page runs exactly as it would for a real Sleeper league.

## Credits

Long Snap was inspired by [nmelhado's League Page](https://github.com/nmelhado/league-page), the Sleeper league site that showed what a league website could be. Long Snap is a separate codebase.

Not affiliated with Sleeper or the NFL. Player values from [FantasyCalc](https://www.fantasycalc.com). Player photos and team logos from ESPN's public images.
