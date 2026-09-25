-- M38 3/N (D54/D55) — OS TRÊS BANNERS: o pity por TIPO, o token de 1,5·P, a escolha do
-- genérico e a posse de artefato.
--
-- **O pity passa a ser guardado ENTRE banners** (D54): o contador deixa de ser por
-- (jogador, banner) e passa a ser por (jogador, TIPO de banner). A coluna muda de nome para
-- dizer o que ela guarda agora, e o CHECK fecha os valores nos tipos de `packages/gacha`
-- (`migrations.test.ts` confere os dois lados).
ALTER TABLE banner_pity RENAME COLUMN banner_id TO pity_scope;

-- **Ninguém perde pity.** Até aqui existia um banner só, o `banner-elenco`, e ele era um
-- banner de personagem: o contador dele é exatamente o que o rotativo de personagem herda.
-- Os dois andares vão como estão.
UPDATE banner_pity SET pity_scope = 'rotatingCharacter' WHERE pity_scope = 'banner-elenco';

-- Qualquer outra linha seria de um banner que nunca existiu em produção; apagá-la é mais
-- honesto do que adivinhar de que tipo ela era.
DELETE FROM banner_pity WHERE pity_scope NOT IN ('rotatingCharacter', 'rotatingArtifact', 'generic');

ALTER TABLE banner_pity
  ADD CONSTRAINT banner_pity_scope_check CHECK (pity_scope IN ('rotatingCharacter', 'rotatingArtifact', 'generic'));

-- O token de 1,5·P (roadmap do M38): contador DURO por (jogador, banner rotativo de
-- personagem) — por banner, e não por tipo, porque é o prêmio de ter rolado NAQUELE banner.
-- `pending` é o caso de bater o limiar sem possuir o destaque: o token espera em vez de se
-- perder.
CREATE TABLE banner_tokens (
  player_id text NOT NULL REFERENCES players (id),
  banner_id text NOT NULL,
  rolls integer NOT NULL CHECK (rolls >= 0),
  status text NOT NULL CHECK (status IN ('counting', 'pending', 'granted')),
  PRIMARY KEY (player_id, banner_id)
);

-- D54 — a escolha a cada 180 rolagens no genérico. Contador PRÓPRIO, que só zera ao
-- conceder; as escolhas não resgatadas acumulam em `pending`.
CREATE TABLE generic_choices (
  player_id text NOT NULL REFERENCES players (id),
  banner_id text NOT NULL,
  rolls integer NOT NULL CHECK (rolls >= 0),
  pending integer NOT NULL CHECK (pending >= 0),
  PRIMARY KEY (player_id, banner_id)
);

-- D53 — a posse de ARTEFATO. Uma instância por (jogador, definição): a segunda cópia é
-- duplicata e vira fragmento, que é o que alimenta o imprint. O rank corrente NÃO é
-- gravado — é `rankCorrente(base, awakening)`, como o do personagem (D49).
CREATE TABLE player_artifacts (
  id text PRIMARY KEY,
  player_id text NOT NULL REFERENCES players (id),
  artifact_id text NOT NULL,
  awakening integer NOT NULL DEFAULT 0 CHECK (awakening BETWEEN 0 AND 6),
  imprint integer NOT NULL DEFAULT 0 CHECK (imprint BETWEEN 0 AND 5),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, artifact_id)
);
