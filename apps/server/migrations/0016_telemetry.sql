-- M34 1/N (D45) — telemetria: o servidor mede o jogo, e o jogador pode recusar.
--
-- Duas tabelas, e só o que responde ao aceite do M34 (onde o jogador para, quanto tempo a
-- missão leva, quando foi visto pela última vez). Nada aqui identifica alguém além do
-- `player_id` que o servidor já tem em toda tabela (§9.4).
--
-- A escolha de recusar mora ao lado do "último visto" porque os dois são "a conta e a
-- telemetria"; a linha só existe depois do primeiro sign-in ou da primeira escolha. Sem linha
-- lê-se como "não recusou, nunca visto".
CREATE TABLE telemetry_accounts (
  player_id text PRIMARY KEY REFERENCES players (id),
  opt_out boolean NOT NULL DEFAULT false,
  -- Epoch em ms, como `players.energy_as_of`: é o `now()` injetado do servidor que escreve,
  -- e o relatório compara com o mesmo relógio.
  last_seen_at bigint
);

-- Uma linha por TENTATIVA de missão: aberta quando o ticket é emitido, fechada quando a run
-- chega. Ticket sem run é abandono, e é dado — é exatamente "onde o jogador para".
-- A chave é o nonce do ticket, o mesmo que a run devolve; é o que casa começo com fim.
CREATE TABLE mission_attempts (
  nonce text PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (id),
  mission_id text NOT NULL,
  issued_at bigint NOT NULL,
  finished_at bigint,
  outcome text CHECK (outcome IN ('victory', 'defeat')),
  rounds integer
);

CREATE INDEX mission_attempts_player_idx ON mission_attempts (player_id);
