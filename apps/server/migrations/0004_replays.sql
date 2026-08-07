CREATE TABLE replays (
  nonce text PRIMARY KEY,
  rules_version text NOT NULL,
  seed integer NOT NULL,
  initial_state jsonb NOT NULL,
  commands jsonb NOT NULL,
  result jsonb NOT NULL,
  attacker_player_id text NOT NULL REFERENCES players (id),
  defender_player_id text NOT NULL REFERENCES players (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX replays_attacker_player_id_idx ON replays (attacker_player_id);
CREATE INDEX replays_defender_player_id_idx ON replays (defender_player_id);
