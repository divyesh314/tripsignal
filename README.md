# TripSignal

**One signal for your whole trip.** Enter a US trip, including up to two connecting flights, and TripSignal checks every airport you pass through. It answers with a traffic light:

| Signal | Meaning | What the app does |
|---|---|---|
| 🟢 **Green** | Under 40% chance of disruption | Tells you when to be at the airport and reminds you about baggage limits |
| 🟠 **Orange** | 40–84%: possible, not certain | Explains the risk (e.g. strong winds at your connection) and suggests options |
| 🔴 **Red** | 85% or more: likely | Opens an action panel: pre-book an Uber at your destination, find a lounge, see later flights, share that you may be late |

Every signal shows **the evidence behind it and where it came from**, so the traveller (or an Operations team) can check it rather than just trust it.

**Live app:** (https://tripsignal-lfff.vercel.app/signin)  ·  **Code:** (https://github.com/divyesh314/tripsignal)

Built for the Red Alpha Forward Deployed Engineer project assignment.

---

## How this was built: my ideas, AI's help

I built TripSignal together with an AI assistant (Claude). I want to be clear about who did what, because the brief asks how and where AI was used, and because I think the split is the interesting part.

### What came from me

- **The product idea and how it should feel.** A single traffic-light answer instead of a dashboard of raw data. Green means go, orange means "possible, keep watching", red means act.
- **The red line at 85%.** I decided that "likely" should mean 85% or more, and that only then should the app interrupt the traveller with actions.
- **What a traveller actually needs when things go wrong.** Pre-booking an Uber at the destination, booking a lounge at the delayed airport, seeing later flights, and letting someone know you'll be late.
- **Connecting flights.** Real trips have connections, so the app had to support up to two and check every airport, not just origin and destination.
- **The baggage check.** Warning travellers about weight limits before they leave home.
- **Web app, not mobile app.** I chose a responsive web app so it works on any device without app stores.
- **The stack.** Next.js for the frontend, PostgreSQL for structured data, MongoDB for raw source data, and a Postgres table as the job queue (instead of adding Redis). Deployed on Vercel, Render and MongoDB Atlas.
- **Setting up and running everything.** I created and configured the GitHub repo, the Atlas cluster, the Render database and the Vercel project. I set the environment variables and secrets, created the database tables, and tested the live app.

### My engineering work on the code

The AI wrote the first version of the code. I then went through the codebase file by file to understand every part (data sources, scoring engine, job queue, API routes and pages) and rewrote it to be shorter and clearer, keeping the tests passing after every change.

- **Size:** reduced the code of TypeScript, with the same features and all 15 tests passing.


Going through the code this deeply is what lets me explain and defend every design decision in it, not just the parts I designed on paper.

### What the AI helped with

- **Researching the problem.** Listing 68 possible travel disruptions, from thunderstorms and FAA ground stops to tight connections and holidays. It checked which have **free** public data sources, then scored each by likelihood × impact to decide what to build and what to leave out. This became `Travel_Disruption_Obstacles.xlsx`.
- **Design.** Turning my ideas into screen designs (sign-in, trip planner, green/orange/red results, red-alert popup, baggage check), first for mobile, then as a web app in the same colours.
- **Architecture.** Drawing the backend diagram and proposing the split between Postgres (users, trips, scores, job queue) and MongoDB (raw API responses as a cache, and the evidence behind each score).
- **Writing the first version of the code.** The Next.js pages, API routes, one adapter per data source, the scoring engine, the job queue and worker, and the database schema. I then reviewed and refactored it (see above).
- **Testing.** Writing 15 automated tests and running the whole app end to end against real databases with sample data. Testing caught a real bug: when weather sources were unreachable, the app showed a misleading **green** light. It now shows **"No signal yet"** instead of a false all-clear.
- **Deployment guidance.** Walking me through Atlas, Render, Vercel and GitHub step by step, and replacing a paid background worker with a free GitHub Actions schedule.

### How we worked

I described what I wanted in plain language, reviewed each step (obstacle list, designs, architecture, code), and pushed back or changed direction when something didn't fit. For example, I switched the design from mobile to web, and chose the Postgres job table. The AI moved fast on research, a first draft of the code and tests. I made the product decisions, set up the real infrastructure, then took ownership of the code itself by reading it end to end and rewriting it to be leaner.

---

## How a check works

1. **Trip → stops.** The flights become a list of airports: departure, connection(s), destination. Arrival times are estimated from distance (users only enter departure times), which also gives the layover length.
2. **Sources run in parallel.** Each returns *signals*: a risk at one airport, with a probability, a plain-English reason and a source link.

   | Source | Used for | When it applies |
   |---|---|---|
   | NWS (api.weather.gov) | Official weather warnings and advisories | Within ~3 days |
   | Open-Meteo | Gusts, thunderstorms, snow, fog, freezing rain (de-icing) | Within 16 days |
   | FAA NAS Status | Ground stops, delay programs, closures | Within 12 hours (live data) |
   | National Hurricane Center | Storms near any stop | Within 5 days |
   | GDELT news | Strikes, outages, closures (labelled *unverified*) | Within 3 days |
   | Nager.Date | US holidays (busy periods) | Always |
   | The itinerary itself | Tight connections (under 60 minutes) | Always |

3. **Scoring.** At each airport, risks are combined as independent events: `P = 1 − Π(1 − pᵢ)`. The trip takes its **worst** airport, because one bad connection breaks the whole trip.
4. **Honesty rules.** A source that fails is shown as failed, never as "all clear". Without weather data the app shows **"No signal yet"**, never a false green.
5. **Storage.** Scores go to PostgreSQL; the evidence and raw API responses go to MongoDB, so free APIs aren't called on every check.
6. **Hourly re-checks.** A GitHub Actions schedule calls `/api/cron/recheck` every hour. Trips departing in the next 48 hours are re-scored, and a change of colour (e.g. orange → red) is recorded as an alert.

## Tech stack

| Part | Choice |
|---|---|
| Web app + API | Next.js 15 (App Router, TypeScript) |
| PostgreSQL (Render) | Users, trips, flights, airports, airlines, baggage rules, scores, alerts, **job queue** |
| MongoDB (Atlas) | Raw API responses (cache) and the evidence behind each score |
| Scheduling | GitHub Actions → `/api/cron/recheck` (free); `npm run worker` for local runs |
| Hosting | Vercel |

## Run it locally

```bash
docker compose up -d                 # or use cloud Postgres + MongoDB URLs instead
cp .env.example .env.local           # fill in DATABASE_URL, MONGODB_URL, AUTH_SECRET, CRON_SECRET
npm install
npm run db:setup                     # creates tables, seed data and Mongo indexes
npm run dev                          # http://localhost:3000
npm test                             # 15 engine and parser tests
```

**Demo mode:** set `SOURCE_MODE=mock` and `MOCK_SCENARIO=green|orange|red` to run without internet, with sample data shaped exactly like the real APIs. On the Plan page, **Fill in an example trip** loads Chicago → Denver → Los Angeles.

## Deploy

1. **MongoDB Atlas:** free cluster, a database user, network access `0.0.0.0/0`. Use the connection string with `/tripsignal` before the `?`.
2. **Render:** free Postgres; use the External Database URL with `?sslmode=require`.
3. Run `npm run db:setup` once with both URLs in `.env.local`.
4. **Vercel:** import the GitHub repo and add the environment variables from `.env.local`.
5. **GitHub → Settings → Secrets → Actions:** add `APP_URL` (the Vercel link) and `CRON_SECRET` to turn on hourly re-checks.

Never commit `.env.local`; `.gitignore` already excludes it.

## Assumptions

- US domestic flights; 42 major airports are included (the full OurAirports list can be imported).
- Arrival times are estimated (distance ÷ 780 km/h + 35 minutes).
- Risk probabilities per alert type are rule-based starting points, not yet calibrated.
- Baggage: 50 lb (23 kg) is the standard US economy checked-bag limit. Carry-on sizes and heavy-bag rules are marked unverified and link to each airline's own page.

## What I'd change before real users

- **Calibrate the probabilities** against historical on-time data (US BTS) instead of rule-based estimates.
- **Real flight status** (a paid feed) to catch cancellations, gate changes and late incoming aircraft.
- **Send alerts** by email or push notification; today they are recorded and logged.
- Monitoring and rate limits for each data source, with an alert when one keeps failing.
- Password reset, email verification, an accessibility audit with screen readers, and a least-privilege database user.
- Rotate all database credentials and keep them in a secrets manager.
