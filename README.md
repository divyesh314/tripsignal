# TripSignal

Enter a US trip (up to 2 connections) and get one signal for the whole journey:

- **Green** – under 40% chance of disruption
- **Orange** – 40–84%: possible, keep watching
- **Red** – 85% or more: likely. The app offers actions (pre-book a ride, find a lounge, see later flights, share that you may be late)

Every signal shows the evidence behind it and where it came from. A background worker re-checks upcoming trips every hour and records an alert when a trip changes colour.

## Stack

| Part | Choice |
|---|---|
| Web app + API | Next.js 15 (App Router, TypeScript). Pages and API routes live in one app |
| PostgreSQL | Users, trips, flight legs, airports, airlines, baggage rules, scores, alerts, **job queue** |
| MongoDB | Raw API responses (doubles as a cache, auto-expiring) and the evidence behind each score |
| Worker | `scripts/worker.ts`, claims jobs from the Postgres `jobs` table with `FOR UPDATE SKIP LOCKED` |

## Run it locally

```bash
docker compose up -d                 # Postgres 16 + MongoDB 7
cp .env.example .env.local           # then set AUTH_SECRET to a long random string
npm install
npm run db:setup                     # tables, seed data, Mongo indexes
npm run dev                          # http://localhost:3000
npm run worker                       # in a second terminal: hourly re-checks
npm test                             # engine and parser tests
```

### Demo mode (no internet needed)

Set `SOURCE_MODE=mock` and `MOCK_SCENARIO=green|orange|red` in `.env.local`, then restart. Mock data is shaped exactly like each real API and goes through the same parsers. The bad weather lands on the first connection (or the destination for a direct flight). On the Plan page, **Fill in an example trip** loads Chicago → Denver → Los Angeles.

## How a check works

1. **Trip → stops.** Legs become departure, connection(s) and destination. Arrival times are estimated from distance (we don't ask users for them), which also gives the layover length. Each stop gets a time window: around departure, from arrival to onward departure, or after arrival.
2. **Sources run in parallel.** Each returns *signals*: `{airport, kind, probability, text, source, url}`. Each source only runs when it can say something useful for that date:

| Source | Used for | When it applies |
|---|---|---|
| NWS alerts (`api.weather.gov`) | Official warnings and advisories | Within ~3 days |
| Open-Meteo | Gusts, thunderstorms, snow, fog, freezing rain (de-icing) | Within 16 days |
| FAA NAS Status | Ground stops, delay programs, closures | Within 12 hours (live data) |
| National Hurricane Center | Storms near any stop | Within 5 days |
| GDELT news | Strikes, outages, closures (labelled *unverified*, capped at 30%) | Within 3 days |
| Nager.Date holidays | Busy travel periods | Always |
| Your itinerary | Tight connections (< 60 min) | Always |
| BTS history (optional table) | Route delay baseline | If `route_baselines` is loaded |

3. **Scoring.** At each airport, risks are treated as independent: `P = 1 − Π(1 − pᵢ)`. The trip takes its **worst** airport, because one bad connection breaks the whole trip.
4. **Honesty rules.** A source that fails is shown as failed, never as "all clear". Without weather data the app won't show green: it shows **"No signal yet"** instead (orange/red can still show if, say, the FAA reports a ground stop).
5. **Storage.** Score and per-stop results go to Postgres. Signals and source statuses go to MongoDB (`evidence`). Raw responses are cached in MongoDB (`source_snapshots`) so free APIs aren't called on every check.

## Deploy (free tiers)

| Piece | Where | Notes |
|---|---|---|
| Next.js app | **Vercel** | Import the GitHub repo; defaults work |
| PostgreSQL | **Render** (free Postgres) | Free databases expire 30 days after creation, which is enough for the assessment |
| MongoDB | **MongoDB Atlas** (free M0) | Render doesn't host MongoDB |
| Hourly re-checks | **GitHub Actions** → `/api/cron/recheck` | Render background workers aren't free and Vercel Hobby cron only runs once a day |

1. **Render:** create a Postgres database. Copy its **External Database URL** and add `?sslmode=require` to the end.
2. **Atlas:** create a free cluster and a database user. Under Network Access allow `0.0.0.0/0` (Vercel has no fixed IPs). Copy the `mongodb+srv://…` string and put `/tripsignal` before the `?`.
3. **Set up the tables once** from your machine: put both URLs in `.env.local` and run `npm run db:setup`.
4. **Vercel:** import the repo and add environment variables: `DATABASE_URL`, `MONGODB_URL`, `AUTH_SECRET`, `CRON_SECRET`, `SOURCE_MODE=live`, `NWS_USER_AGENT` (with your email). Deploy.
5. **GitHub:** repo Settings → Secrets and variables → Actions. Add `APP_URL` (your Vercel URL, no trailing slash) and `CRON_SECRET` (same value as Vercel). The workflow in `.github/workflows/recheck.yml` then runs every hour; use **Run workflow** to test it.

Never commit `.env.local`; it's already in `.gitignore`.

## Project layout

```
app/                 pages (signin, plan, trips, trips/[id], baggage) and api/ routes
components/          UI pieces (signal light, meter, plan form, red-alert popup, bag checker)
lib/sources/         one adapter per data source + mock payloads
lib/risk.ts          scoring, thresholds, headlines
lib/trips.ts         trip storage, running a check, loading results
lib/jobs.ts          Postgres job queue
db/schema.sql        tables (incl. jobs), db/seed.sql reference data
scripts/             setup-db.mjs, worker.ts
tests/               engine and parser tests
```

## Assumptions

- US domestic flights only; 42 major airports are seeded (import OurAirports for full coverage).
- Arrival times are estimated (distance ÷ 780 km/h + 35 min).
- Probabilities per alert type are rule-based starting points, not yet calibrated.
- Baggage: 50 lb economy limit is standard for US airlines; carry-on sizes and heavy-bag limits are marked unverified and link to each airline's page.

## Before real users

- **Calibrate the probabilities** against BTS on-time history (load `route_baselines`, back-test past storms and ground stops).
- **Real flight status** (a paid feed) to catch cancellations, gate changes and late inbound aircraft.
- **Send alerts** by email or web push (the notifier currently records and logs them).
- Rate limiting, request logging and monitoring for each source; alert when a source keeps failing.
- Accessibility audit with screen readers; password reset; email verification.
- Load the full OurAirports list and verify every baggage rule.

## How AI was used

_Fill in: which parts you built with Claude / Claude Code, and what you reviewed, tested or changed yourself._
