CREATE TABLE seasons (
  id text PRIMARY KEY,
  season_number integer NOT NULL UNIQUE,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL
);
