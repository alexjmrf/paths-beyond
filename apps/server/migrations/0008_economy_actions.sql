-- §10 (M14, sub-sessão 4/N) — idempotência das ações de progressão.
--
-- Enhance, awakening, imprint e equipar cobram recurso. Sem uma chave de idempotência, um
-- reenvio de rede (o cliente não sabe se a primeira chegou) cobraria duas vezes. Mesma
-- defesa que `dungeon_runs` dá à masmorra e `replays.nonce` dá à batalha de arena — aqui
-- genérica, porque as quatro ações compartilham exatamente o mesmo problema.
CREATE TABLE economy_actions (
  nonce text PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (id),
  kind text NOT NULL CHECK (kind IN ('enhance', 'awaken', 'imprint', 'equip')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX economy_actions_player_idx ON economy_actions (player_id);
