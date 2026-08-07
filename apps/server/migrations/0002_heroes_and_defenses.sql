CREATE TABLE heroes (
  hero_id text PRIMARY KEY,
  owner_player_id text NOT NULL REFERENCES players (id),
  hero jsonb NOT NULL,
  equipped_items jsonb NOT NULL
);

CREATE INDEX heroes_owner_player_id_idx ON heroes (owner_player_id);

CREATE TABLE arena_defenses (
  owner_player_id text PRIMARY KEY REFERENCES players (id),
  map_id text NOT NULL,
  units jsonb NOT NULL
);
