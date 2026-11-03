# Poker Night

A small web app for a regular home poker game. It records each night's buy-ins
and cash-outs, works out who owes whom, and keeps a season leaderboard.

- **Members** sign in on their phone to see the standings, past games and who
  pays whom. Anyone can request an account; an admin approves it first.
- **Admins** run the night: start a game, add buy-ins, enter cash-outs,
  finalize, and approve new members.

Built with Vite, React and TypeScript, on a Supabase project. Row Level Security
(RLS) in the database decides who can read what and who can write. The app's
own checks only pick which screen to show.

> **Members-only needs a database change.** The SQL is in
> `supabase/proposed/2026-10-16_members_only.sql`. Until it has been run, the
> database still lets anyone read finalized games, and members can't be
> approved. See [Members and sign-ups](#members-and-sign-ups).

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and
publishable key. `.env.local` is ignored by git, so it never gets committed.

```bash
npm run dev
```

Then open http://localhost:5173. This talks to your Supabase project.

### Without the database

```bash
npm run dev:fake
```

This runs the app against an in-memory stand-in with sample games and sample
accounts (an admin, an approved member and people waiting for approval), so you
can click through every screen with no Supabase project at all. The test
accounts and their shared password are in `src/data/fakeApi.ts`
(`FAKE_ACCOUNTS`, `FAKE_PASSWORD`). Sign-ups in the fake skip the confirmation
email. Its data is kept in the browser's local storage; clear site data to
reset it. The fake is never included in a production build.

### Tests

```bash
npm test
```

Covers money parsing and formatting, the settlement plan (every row of the
acceptance table, plus randomised checks over thousands of games), the entry
sheet's validation and running total, and the friendly error messages.

## Deploy

The app is a static site, so any static host works.

### Netlify (drag and drop)

1. Make sure `.env.local` is filled in, then run `npm run build`. The settings
   are built into the output, so Netlify needs none of its own.
2. In Netlify, open the site → **Deploys**, and drag the `dist` folder onto the
   page. The site keeps its address.

`public/_redirects` sends every path to `index.html` so links like
`/games/<id>` work on reload.

### Vercel

1. In the Vercel project's **Settings → Environment Variables**, set
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. `.env.local` isn't
   uploaded, and the build stops with a clear error if either is missing.
2. Sign in once: `npx vercel login`
3. Preview deploy from this folder: `npx vercel`
4. Production deploy: `npx vercel --prod`

`vercel.json` sets the build (`npm run build`, output `dist`) and sends every
path to `index.html` so links like `/games/<id>` work on reload.

The publishable key ends up in the browser by design and grants only what RLS
allows. Never put a secret or `service_role` key in this app.

## Make someone an admin

The owner does this in the Supabase dashboard.

1. Get them an account: either they sign up in the app (**Request access**),
   or create one in **Authentication → Users → Add user** (tick **Auto Confirm
   User** so they can sign in without the confirmation email).
2. Open `supabase/scripts/add_admin.sql`, change the email on the line marked
   `CHANGE THIS`, paste the file into the **SQL editor** and run it.
3. The result lists every admin. The new one should be there with
   `member_status` = `approved`.

If the email has no account yet, the script stops and says so. Running it
twice is harmless. Until it has run, that person's admin screens show
"Admins only" and the database refuses every change.

## Members and sign-ups

Once the members SQL is applied, the whole site is private:

- **Signed out:** the sign-in page, with a **Request access** link.
- **Request access:** name, email and password. Supabase emails a confirmation
  link; after confirming, the account is **waiting for approval** and sees
  only a "Waiting for approval" screen.
- **Admin → Members:** everyone waiting, with **Approve** / **Reject**.
  Approved members can be removed later, and rejected ones approved. The admin
  home shows how many are waiting.
- **Approved members** see the standings, games and settle-up plans. They can't
  change anything.

The database enforces all of this: signed-out visitors and unapproved accounts
get no rows back, whatever the app shows.

### Applying the members SQL (owner)

1. Read `supabase/proposed/2026-10-16_members_only.sql`. It explains each part
   and ends with a commented-out rollback.
2. Paste the whole file into the Supabase **SQL editor** and run it once. It
   runs as one transaction: either all of it applies or none of it does.
3. Existing accounts are added to the members list: admins as approved,
   everyone else as waiting.

### Auth settings

In **Authentication → Sign In / Providers → Email**:

- **Allow new users to sign up:** keep it **off** until the members SQL is
  applied, then turn it **on**.
- **Confirm email:** keep it **on**, so people can only sign up with an email
  they control.

In **Authentication → URL Configuration**, set **Site URL** to the deployed
address and add it (plus `http://localhost:5173` for local testing) to
**Redirect URLs**, so the confirmation link brings people back to the app.

Open sign-ups mean strangers can create accounts. They can't see or change
anything until approved, and you can reject them. If spam sign-ups become a
problem, turn on CAPTCHA in **Authentication → Attack Protection**.

## Carried-over totals

Results from before this app can come in as **carried-over totals**: per
player, games played and net winnings, without the individual nights.

- The standings add each player's carried-over games and net to the games
  played here.
- Best and worst night only count games played in this app; players with only
  carried-over games show neither.
- The earlier nights don't appear in game history. `CARRIED_OVER_GAMES` in
  `src/config.ts` is how many there were, for the standings' game count.

The schema is in `supabase/proposed/2026-10-16_carryover.sql`, which also shows
how to load totals. It works before or after the members SQL. The app works
without it too; the standings just won't include carried-over totals.

## Running a game night

1. **Admin → Start a game.** Tick everyone who's playing. Each starts on the
   usual $30 buy-in; change anyone who bought in for something else. Changing
   the usual buy-in updates everyone you haven't changed by hand. "Start game"
   creates the game with those players.
2. **During the night**, tap **+ Buy-in** on a player's line to add a re-buy.
   It opens at $30; type a different amount (say $15) and tap Add.
   The line's total buy-in goes up by that much. Late arrivals: **+ Add a player**.
3. **At the end**, type each cash-out (leave it blank for anyone who busted).
   **Finalize** unlocks when cash-outs equal buy-ins.

The game saves itself about a second after each change, so nothing depends on
pressing Save. It saves only when every line is valid. While a line has a
problem, the bar at the bottom says "Not saved", and the last good version stays
in the database. The usual buy-in is `STANDARD_BUY_IN_CENTS` in `src/config.ts`.

Only each player's **total** buy-in is stored (the schema has one row per
player per game), so after a reload you see "$45", not "$30 + $15".

## How it works

- **Money is integer cents** everywhere except on screen ($25.00 is stored as
  `2500`). `src/lib/money.ts` parses what an admin types without floating point
  and rejects anything it can't read with certainty, such as `4o`, `1,00`,
  `-5` or `25.505`. A blank cash-out means $0.00 (the player busted). A typo
  is an error that blocks saving; it is never treated as zero.
- **Finalize** stays disabled until every line is valid, there are at least 2
  players and total cash-outs equal total buy-ins. The database enforces the
  same rule with a trigger.
- **Finalized games are locked.** "Reopen to edit" sets the game back to draft,
  which also hides it from members until it is finalized again.
- **Settlement** (`src/lib/settlement.ts`) repeatedly settles the largest debtor
  against the largest creditor, breaking ties by name. That gives at most
  n − 1 payments and the same plan whatever order the players are listed in.
  An unbalanced game gets no plan.
- **Drafts** are invisible to members (RLS returns no row) and show as
  "No such game". The standings and games pages also filter to finalized
  games, so admins see there what members see.

Saving a game takes two requests (upsert the lines, then delete removed ones),
not one transaction. If the second fails, the screen keeps what was typed,
shows "Not saved" with a Retry button, and the next save fixes it. Making this
atomic would need a database function, which would be a schema change.

## Project layout

```
src/
  lib/        pure logic with tests: money, settlement, entry sheet, sign-up, dates, errors
  data/       Supabase access (supabaseApi.ts) and the dev-only fake (fakeApi.ts)
  pages/      one file per screen
  ui/         shared components, auth and access context, hooks
  styles.css  the dark theme
supabase/
  proposed/   database changes to review, then run in the SQL editor
  scripts/    one-off admin scripts
```
