-- §10 (M18, sub-sessão 3/N) — posse de personagem, contador de pity e a quarta moeda.
--
-- Posse não existia em lugar nenhum do projeto: `heroes` guardava as INSTÂNCIAS de herói
-- semeadas, e nenhuma rota perguntava se o jogador possuía o personagem que mandou. §9.4
-- ("o servidor recalcula o estado a partir do banco") não tinha como pegar isso, porque
-- não havia o que consultar.

-- D17 — a quarta moeda. Integer, e não bigint como o ouro: ela não acumula por farm (não
-- se ganha farmando), então a ordem de grandeza é de milhares e não de bilhões.
ALTER TABLE players ADD COLUMN premium integer NOT NULL DEFAULT 0;

-- Só o que foi ADQUIRIDO tem linha aqui. O núcleo de história (D14) é derivado do
-- catálogo — quem tem `acquisition: 'story'` é de todo mundo, por definição —, e guardar
-- linhas para ele seria uma cópia que pode divergir do dado, além de exigir um passo de
-- concessão em toda conta nova.
CREATE TABLE player_characters (
  player_id text NOT NULL REFERENCES players (id),
  character_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, character_id)
);

-- D18 — pity duro contado, por (jogador, banner). Uma linha por banner e não um contador
-- único do jogador: um banner futuro tem o próprio limiar, e o contador do jogador em um
-- não pode adiantar o outro.
CREATE TABLE banner_pity (
  player_id text NOT NULL REFERENCES players (id),
  banner_id text NOT NULL,
  rolls_since_new integer NOT NULL CHECK (rolls_since_new >= 0),
  PRIMARY KEY (player_id, banner_id)
);
