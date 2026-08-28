-- §10 (M14, sub-sessão 3/N) — o estado de conta do PvE.
--
-- Decisão do usuário (M14 1/N): ele mora no servidor, como o PvP de M7/M8 — §9.4 manda o
-- servidor recalcular o estado a partir do banco, e partir a economia em duas (marcas aqui,
-- ouro no cliente) seria pior que não tê-la.

-- Ouro em bigint: acumula ao longo de toda a conta. Pedras em integer (custo de enhance,
-- ordem de dezenas). Energia guardada como o par {stored, asOfMs} que `resolveEnergy` (core)
-- consome — a energia atual é DERIVADA do instante, então não existe tarefa periódica
-- enchendo barra de ninguém.
ALTER TABLE players ADD COLUMN gold bigint NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN stones integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN energy_stored integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN energy_as_of bigint NOT NULL DEFAULT 0;

-- Materiais e fragmentos. Uma linha por (jogador, material) em vez de um jsonb: toda
-- operação real é "quanto tenho de X" e "debita N de X".
CREATE TABLE player_materials (
  player_id text NOT NULL REFERENCES players (id),
  material_id text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (player_id, material_id)
);

-- Inventário: o que dropou e ainda não foi equipado. Item equipado continua vivendo em
-- `heroes.equipped_items` (M7) — um item nunca está nos dois lugares.
CREATE TABLE player_items (
  item_id text PRIMARY KEY,
  owner_player_id text NOT NULL REFERENCES players (id),
  item jsonb NOT NULL
);

CREATE INDEX player_items_owner_idx ON player_items (owner_player_id);

-- Quais masmorras o jogador já limpou À MÃO. É o que libera a varredura (decisão do
-- usuário: as dificuldades menores precisam ser limpas antes de aceitar time automático).
CREATE TABLE dungeon_clears (
  player_id text NOT NULL REFERENCES players (id),
  dungeon_id text NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, dungeon_id)
);

-- Estado da trava de tempo da dificuldade alta, por masmorra. Mesmo formato derivado da
-- energia: `{used, as_of_ms}`, e o reset é calculado pelo core a partir da agenda declarada
-- no conteúdo.
CREATE TABLE dungeon_entries (
  player_id text NOT NULL REFERENCES players (id),
  dungeon_id text NOT NULL,
  used integer NOT NULL CHECK (used >= 0),
  as_of_ms bigint NOT NULL,
  PRIMARY KEY (player_id, dungeon_id)
);

-- Idempotência da run, pelo mesmo mecanismo do `nonce` de `POST /battles` (M7): uma run só
-- é cobrada e recompensada uma vez, mesmo se a requisição for reenviada.
CREATE TABLE dungeon_runs (
  nonce text PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (id),
  dungeon_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('manual', 'auto')),
  outcome text NOT NULL CHECK (outcome IN ('victory', 'defeat')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dungeon_runs_player_idx ON dungeon_runs (player_id);
