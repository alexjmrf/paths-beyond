-- §10 (M18, sub-sessão 4/N) — as quatro FONTES da moeda premium.

-- Uma linha por prêmio já pago. Conquistas e eventos dividem a tabela porque a pergunta é
-- a mesma ("este prêmio já foi pago a este jogador?") e os ids são únicos entre os dois.
-- A chave primária composta é o que torna a reivindicação idempotente sem transação
-- explícita: a segunda tentativa colide em vez de pagar de novo.
CREATE TABLE player_claims (
  player_id text NOT NULL REFERENCES players (id),
  reward_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, reward_id)
);

-- Capítulos limpos. SEPARADO de `dungeon_clears`, e não por organização: aquele conjunto
-- tem significado próprio (é o que libera a varredura, via `requiresClearOf`), e misturar
-- capítulo nele faria um capítulo limpo destravar uma masmorra por acidente.
--
-- Isto só passa a existir porque o servidor passou a OBSERVAR a campanha nesta fatia: até
-- M18 3/N a campanha era jogada inteiramente no cliente, com o progresso em localStorage, e
-- o servidor não tinha como saber que um capítulo foi vencido. Moeda premium é estado de
-- conta, e §9.4 não deixa o cliente afirmar que mereceu.
CREATE TABLE campaign_clears (
  player_id text NOT NULL REFERENCES players (id),
  chapter_id text NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, chapter_id)
);
