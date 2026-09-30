-- TripSignal PostgreSQL schema
-- Structured, relational data: users, trips, scores, reference data and the job queue.
-- Safe to re-run: every statement is idempotent.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reference data -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS airports (
  iata     CHAR(3) PRIMARY KEY,
  name     TEXT NOT NULL,
  city     TEXT NOT NULL,
  state    TEXT,
  lat      DOUBLE PRECISION NOT NULL,
  lon      DOUBLE PRECISION NOT NULL,
  timezone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS airlines (
  code        TEXT PRIMARY KEY,         -- IATA code, e.g. UA
  name        TEXT NOT NULL,
  website_url TEXT
);

CREATE TABLE IF NOT EXISTS baggage_rules (
  airline_code     TEXT NOT NULL REFERENCES airlines(code),
  cabin            TEXT NOT NULL DEFAULT 'economy',
  checked_limit_lb INTEGER NOT NULL,
  heavy_limit_lb   INTEGER,              -- above this, bag may be refused
  carry_on_size    TEXT,
  source_url       TEXT,
  verified_at      DATE,                 -- NULL = not yet verified against the airline site
  PRIMARY KEY (airline_code, cabin)
);

-- Historical baseline from BTS on-time data (optional, loaded separately)
CREATE TABLE IF NOT EXISTS route_baselines (
  origin_iata     CHAR(3) NOT NULL,
  dest_iata       CHAR(3) NOT NULL,
  month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  late_15_rate    REAL NOT NULL,        -- share of flights 15+ min late
  cancel_rate     REAL NOT NULL,
  flights_counted INTEGER NOT NULL,
  PRIMARY KEY (origin_iata, dest_iata, month)
);

-- Trips ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trips (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  travel_date    DATE NOT NULL,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trips_user_idx ON trips(user_id, travel_date DESC);

CREATE TABLE IF NOT EXISTS trip_legs (
  id           BIGSERIAL PRIMARY KEY,
  trip_id      BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq          SMALLINT NOT NULL CHECK (seq BETWEEN 1 AND 3),   -- max 2 connections
  airline_code TEXT NOT NULL REFERENCES airlines(code),
  flight_no    TEXT,
  origin_iata  CHAR(3) NOT NULL REFERENCES airports(iata),
  dest_iata    CHAR(3) NOT NULL REFERENCES airports(iata),
  dep_date     DATE NOT NULL,           -- local date at origin
  dep_time     TIME NOT NULL,           -- local time at origin
  UNIQUE (trip_id, seq)
);

-- Scores ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS risk_assessments (
  id          BIGSERIAL PRIMARY KEY,
  trip_id     BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  probability REAL NOT NULL,            -- 0..1
  level       TEXT NOT NULL CHECK (level IN ('green','orange','red','unknown')),
  headline    TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  sources_ok  INTEGER NOT NULL,
  sources_failed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assessments_trip_idx ON risk_assessments(trip_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS assessment_stops (
  assessment_id BIGINT NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  seq           SMALLINT NOT NULL,
  airport_iata  CHAR(3) NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('departure','connection','destination')),
  probability   REAL NOT NULL,
  level         TEXT NOT NULL,
  main_reason   TEXT NOT NULL,
  PRIMARY KEY (assessment_id, seq)
);

-- Alerts ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications_sent (
  id          BIGSERIAL PRIMARY KEY,
  trip_id     BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_level  TEXT,
  to_level    TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'log',
  message     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job queue (Postgres table instead of Redis) --------------------------------
-- Workers claim jobs with SELECT ... FOR UPDATE SKIP LOCKED, so several
-- workers can run safely at once.

CREATE TABLE IF NOT EXISTS jobs (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,            -- e.g. 'recheck_trip'
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts    INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error  TEXT,
  locked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(run_at) WHERE status = 'pending';
-- At most one queued or running re-check per trip.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_recheck
  ON jobs ((payload->>'tripId'))
  WHERE type = 'recheck_trip' AND status IN ('pending','running');
