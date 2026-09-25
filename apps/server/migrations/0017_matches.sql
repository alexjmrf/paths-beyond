-- M36 2/N (D47) — a BATALHA VIVA. O inimigo é desconhecido, então o estado da batalha mora no
-- servidor: `ticket → joga tudo → run` sai de cena e entra uma partida com começo, comandos e
-- fim, que sobrevive a uma queda de conexão e a um deploy.
--
-- O que a linha guarda é a RECEITA, não o estado: setup + seed + comandos. O `BattleState` é
-- reconstruído a cada requisição (§3.3 de `01-fundacoes-tecnicas.md` — "derivado exclusivamente
-- de initialState + seed + commands"), e é por isso que o replay de uma batalha viva reproduz
-- exatamente o que ela produziu: são o mesmo cálculo sobre a mesma linha.
--
-- `setup` é jsonb e guarda os DOIS lados inteiros, com stats, skills e scripts. É a única cópia
-- completa que existe, e ela nunca sai daqui sem passar por `battle/visao.ts`.
CREATE TABLE matches (
  nonce text PRIMARY KEY,
  -- Quem joga. Na arena, o atacante — o defensor é o `ref_id`.
  player_id text NOT NULL REFERENCES players (id),
  kind text NOT NULL CHECK (kind IN ('campaign', 'dungeon', 'arena')),
  -- chapterId, dungeonId ou o id do defensor, conforme o kind. Sem FK: dois dos três são ids de
  -- CONTEÚDO, que não vivem em tabela nenhuma.
  ref_id text NOT NULL,
  rules_version text NOT NULL,
  seed bigint NOT NULL,
  setup jsonb NOT NULL,
  commands jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL DEFAULT 'ongoing' CHECK (outcome IN ('ongoing', 'victory', 'defeat')),
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  -- Fechou porque o jogador desistiu, e não porque a batalha acabou. Separado do `outcome`
  -- porque a telemetria do M34 lê as duas coisas de formas diferentes: desistir continua sendo
  -- abandono, e contá-lo como derrota apagaria o sinal de "onde o jogador para".
  forfeited boolean NOT NULL DEFAULT false
);

-- **No máximo UMA partida em andamento por jogador**, garantido pelo banco e não só pela rota.
-- É o que impede abandonar uma masmorra que está indo mal para abrir outra sem pagar de novo: a
-- energia é cobrada ao ABRIR (D48), e sem esta constraint o custo viraria opcional.
CREATE UNIQUE INDEX matches_uma_em_andamento_por_jogador
  ON matches (player_id)
  WHERE outcome = 'ongoing';

CREATE INDEX matches_player_idx ON matches (player_id);
