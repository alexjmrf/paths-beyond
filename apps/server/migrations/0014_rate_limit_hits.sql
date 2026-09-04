-- §9.4 (M22, sub-sessão 3/N) — o limitador COMPARTILHADO.
--
-- O limitador em memória conta por PROCESSO: com duas instâncias atrás de um balanceador o
-- teto real vira o dobro do declarado, e com dez vira dez vezes. Como o limite existe para
-- proteger a carteira do jogador (as rotas que gastam a moeda comprável com dinheiro real
-- são as que a 3/N acabou de cobrir), um teto que se multiplica com a escala é um teto que
-- não existe.
--
-- O §2 previu Redis e ele nunca entrou no projeto. Postgres é dependência real desde o M19,
-- roda no CI, e permite PROVAR o limite valendo entre dois processos — coisa que uma
-- implementação Redis não provada aqui não permitiria.
CREATE TABLE rate_limit_hits (
  key text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

-- A consulta é sempre "quantas batidas desta chave dentro da janela": o índice composto é o
-- que a torna barata mesmo com a tabela crescendo entre limpezas.
CREATE INDEX rate_limit_hits_key_at_idx ON rate_limit_hits (key, at);
