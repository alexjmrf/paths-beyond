CREATE TABLE players (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  display_name text NOT NULL
);
