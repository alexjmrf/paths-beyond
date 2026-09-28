-- M39 4/N (D59/D61) — A SOUL. Uma linha por instância; a conta pode ter VÁRIAS do mesmo
-- personagem (decisão do usuário), então não há UNIQUE por (jogador, personagem), ao contrário de
-- `player_artifacts`. `soul_of` é a trava por PERSONAGEM (o nome distinto da trava por classe do
-- artefato é de propósito). `crafts` entra no stream do RNG do recraft.
CREATE TABLE player_souls (
  id text PRIMARY KEY,
  -- A ordem de criação, estável: `crafted_at` empata em inserções seguidas.
  seq bigserial NOT NULL,
  player_id text NOT NULL REFERENCES players (id),
  soul_of text NOT NULL,
  mainstat_stat text NOT NULL,
  mainstat_value integer NOT NULL,
  substats jsonb NOT NULL,
  crafts integer NOT NULL CHECK (crafts >= 1),
  crafted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX player_souls_player_idx ON player_souls (player_id, seq);

-- Craft e recraft cobram recurso: ação de economia com nonce, kind `soul`. Equipar reusa `equip`.
ALTER TABLE economy_actions DROP CONSTRAINT IF EXISTS economy_actions_kind_check;

ALTER TABLE economy_actions
  ADD CONSTRAINT economy_actions_kind_check
  CHECK (kind IN ('enhance', 'awaken', 'imprint', 'equip', 'summon', 'energy', 'exp', 'soul'));
