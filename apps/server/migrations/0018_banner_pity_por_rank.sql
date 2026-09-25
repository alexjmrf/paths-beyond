-- M37 2/N (D50) — O PITY DE DOIS ANDARES.
--
-- O banner deixa de ter um contador e passa a ter um por rank: `Adventurer` garante a cada 10
-- rolagens e `Hero` a cada 90 (números do usuário, em `packages/data`). Os dois são
-- INDEPENDENTES: um `Hero` zera o contador de `Hero` e só, então quem tirou um `Hero` na
-- rolagem 9 ainda recebe o `Adventurer` garantido na 10.
--
-- Duas colunas e não uma tabela nova, nem um jsonb: os ranks de base são uma lista fechada de
-- `packages/core` (`RANKS_DE_BASE`), e `migrations.test.ts` já confere coluna a coluna contra o
-- TypeScript. Um jsonb aqui trocaria essa conferência por nada.
--
-- **A migração dos contadores existentes.** `rolls_since_new` contava "rolagens desde um
-- personagem NOVO", semântica que D50 reverteu — a garantia passou a prometer o RANK e não a
-- novidade. Não há tradução exata, e o valor antigo é COPIADO PARA OS DOIS andares: é o que o
-- jogador efetivamente rolou sem receber nada, não infla nenhum contador além do que ele
-- girou, e nunca o deixa pior do que estava. Zerar seria cobrar de novo um progresso já pago.
ALTER TABLE banner_pity
  ADD COLUMN rolls_since_adventurer integer NOT NULL DEFAULT 0 CHECK (rolls_since_adventurer >= 0),
  ADD COLUMN rolls_since_hero integer NOT NULL DEFAULT 0 CHECK (rolls_since_hero >= 0);

UPDATE banner_pity
SET rolls_since_adventurer = rolls_since_new,
    rolls_since_hero = rolls_since_new;

ALTER TABLE banner_pity DROP COLUMN rolls_since_new;
