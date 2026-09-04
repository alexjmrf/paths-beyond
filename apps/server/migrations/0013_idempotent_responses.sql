-- §9.4 (M22, sub-sessão 2/N) — a RESPOSTA guardada por nonce.
--
-- O nonce já morava em `replays`, `dungeon_runs` e `economy_actions`, e já impedia a segunda
-- cobrança. O que faltava é devolver o que aconteceu na PRIMEIRA: o reenvio levava um 409
-- seco, e para o jogador a run tinha sumido levando a energia junto — ele pagou, o servidor
-- resolveu, e a resposta se perdeu no cabo.
--
-- A chave é (player_id, nonce) e não só o nonce: o nonce é gerado pelo cliente, e um nonce
-- de um jogador nunca pode alcançar a resposta de outro.
CREATE TABLE idempotent_responses (
  player_id text NOT NULL REFERENCES players (id),
  nonce text NOT NULL,
  -- Método + rota. Guardado para recusar o mesmo nonce usado em outra rota: repetir a
  -- resposta de uma masmorra para um pedido de invocação seria responder outra pergunta.
  route text NOT NULL,
  status integer NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, nonce)
);

CREATE INDEX idempotent_responses_created_idx ON idempotent_responses (created_at);
