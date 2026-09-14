-- M35 3/N (D42) — os presets de party: 8 slots por conta.
--
-- Um preset é estado de CONTA (sobrevive à máquina e à reinstalação), pelo mesmo desenho de
-- `arena_defenses` (M15). O servidor não valida o preset contra uma missão — o número de vagas é
-- da missão e o preset é reutilizado entre elas; a tela apara ao aplicar. O que ele valida é posse
-- (§9.4) e o tamanho de time, na rota.
CREATE TABLE party_presets (
  owner_player_id text NOT NULL REFERENCES players (id),
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 8),
  name text NOT NULL,
  hero_ids jsonb NOT NULL,
  PRIMARY KEY (owner_player_id, slot)
);
