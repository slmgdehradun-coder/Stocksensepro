# Updating your live site at copy-2-of-sense-pro.vercel.app

You asked for a zip to "upload to Vercel." Read this first - it affects which method
actually does what you want.

## Important: Vercel Drop (vercel.com/drop) will NOT work for this

Vercel added a drag-and-drop .zip upload feature (vercel.com/drop), but per Vercel's
own documentation: **"Each drop creates a new project. Vercel Drop doesn't redeploy
into an existing project."**

Dragging this zip there would create a brand-new site at a different URL (e.g.
`something-else.vercel.app`), not update `copy-2-of-sense-pro.vercel.app`, and you'd
have to manually re-enter every environment variable (AUTH_SECRET, ADMIN_EMAIL,
ADMIN_PASSWORD, GEMINI_API_KEY, KV_REST_API_URL/TOKEN, etc.) from scratch on the new
project. Skip it for this task.

To update the *same* site at the *same* URL, use one of the two methods below instead.

## Option A - Vercel CLI (closest to "just upload the zip," no Git needed)

Requires [Node.js](https://nodejs.org) installed locally.

1. Extract this zip to a folder on your computer.
2. Open a terminal in that folder:
   ```bash
   cd path/to/extracted-folder
   ```
3. Install the Vercel CLI (one-time):
   ```bash
   npm install -g vercel
   ```
4. Log in (opens a browser to authenticate with your Vercel account):
   ```bash
   vercel login
   ```
5. Link this folder to your **existing** project - when prompted, choose "Link to
   existing project" and select `copy-2-of-sense-pro`:
   ```bash
   vercel link
   ```
6. Deploy to production:
   ```bash
   vercel --prod
   ```

That's it - this updates `copy-2-of-sense-pro.vercel.app` directly, keeps every
environment variable you already configured, and doesn't touch Git at all.

## Option B - Git push (better long-term, if the project came from a repo)

If `copy-2-of-sense-pro` in your Vercel dashboard is connected to a GitHub/GitLab/
Bitbucket repo (check Project -> Settings -> Git), this is the standard way and every
future update becomes a single `git push`:

1. Find that repo and clone/open it locally.
2. Copy this zip's contents over the repo folder (keep the existing `.git` folder).
3. ```bash
   git add .
   git commit -m "AI trade plan fix, fundamentals module, UI updates"
   git push
   ```
4. Vercel auto-deploys within a minute or two - watch progress in the Vercel dashboard's
   Deployments tab.

## After deploying, either way

- Hard-refresh your browser (Ctrl+Shift+R / Cmd+Shift+R) - Vercel's CDN and your
  browser both cache aggressively, and a normal refresh can still show the old build.
- If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` isn't set in your Vercel project's environment
  variables, the sign-in modal will no longer show the "Google Sign-In disabled"
  warning box at all (see ENHANCEMENTS.md section 12) - that's expected, not a bug.
