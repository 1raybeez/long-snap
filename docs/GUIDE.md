# Put your league on Long Snap

About 10 minutes. Free. No code. You need a Sleeper league, and you'll make free GitHub and Vercel accounts along the way.

Every picture below has a **red box** around the thing to click.

---

## 1. Open the setup

Go to **long-snap.vercel.app/get-started** and click **Set up your league**.

![Get your own site page](guide/01-get-started.png)

## 2. Paste your Sleeper league ID

Find your league ID:
- **On sleeper.com:** open your league. The ID is the long number at the end of the web address.
- **In the Sleeper app:** open your league → the gear → **General** → the number at the bottom.

Paste it in the box and click **Find my league**.

![Paste your league ID](guide/02-paste-id.png)

Long Snap shows what it found: your league name, teams, seasons, draft type and divisions. Click **Next: league type**.

![Your league, found](guide/03-found.png)

## 3. Pick your league type

Long Snap guesses from your Sleeper settings. Change it if the guess is wrong, then click **Next: house rules**.

![League type](guide/04-type.png)

## 4. Answer your house rules

How your playoff seeds are decided (division winners, then record, then points for), keepers, and trade vetoes. The numbers must add up to your playoff field. Click **Next: name and colors**.

![House rules](guide/05-rules.png)

## 5. Name and colors

Your league's name becomes your web address. Click a color set or pick your own; the preview shows how it looks. Click **Next: owners**.

![Name and colors](guide/06-colors.png)

## 6. Owners (optional)

Sleeper only knows usernames. Type real names if you want them on the site. Pictures come from each owner's Sleeper picture. Click **Next: put it online**.

![Owners](guide/07-owners.png)

## 7. Copy your settings

Click **Copy settings**. Everything you answered is in that one block of text.

![Copy your settings](guide/08-copy.png)

## 8. Click Deploy to Vercel

![Deploy to Vercel](guide/09-deploy.png)

Vercel opens in a new tab.

**8a. Sign in.** Click **GitHub**. If you don't have a Vercel account yet, this makes one (free). If you don't have a GitHub account either, GitHub walks you through making one first.

![Sign in with GitHub](guide/10-vercel-github.png)

**8b. Make your copy.** Leave the name as it is and click **Create**. This puts your own copy of Long Snap in your GitHub.

![Create your copy](guide/11-vercel-create.png)

**8c. Paste your settings.** Click in the **Value** box next to **LONGSNAP_LEAGUE** and paste (Cmd+V on a Mac, Ctrl+V on Windows). Then click **Deploy**.

![Paste and deploy](guide/12-vercel-paste.png)

Vercel may ask you to **Verify Your Identity**: click **Send Code**, check your email, and type in the 6-digit code.

## 9. Your site is live

In about two minutes Vercel says **Deployed to Production**. Click **Visit** to open your site. Its address is under **Domains** on your project page, like `your-league.vercel.app`. Share it with your league.

![Deployed](guide/13-live.png)

---

## Changing something later

Run the setup again at **long-snap.vercel.app/get-started/setup** and copy the new settings. Then in Vercel: open your project → **Settings** → **Environment Variables** → **LONGSNAP_LEAGUE** → **Edit** → paste → **Save**. Then **Deployments** → the newest one → the **⋯** menu → **Redeploy**.

## A new season

Nothing to do, **as long as you renew your league in Sleeper.** After the season, Sleeper lets the commissioner renew the league for next season, keeping the same league and owners. Your site then finds the new season by itself, within about a day, and keeps all your history.

> **Important for commissioners:** always **renew** your league in Sleeper. If you start a brand-new league in Sleeper instead, Sleeper doesn't connect it to last season, so your site can't find it. If that happens, run the setup again with the new league ID (see "Changing something later" above) and your site picks it up.
