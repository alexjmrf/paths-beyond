-- M19 — a cláusula CHECK de `economy_actions.kind` estava DEFASADA em relação ao código.
--
-- A migration 0008 (M14 4/N) nasceu com quatro kinds, que eram os que existiam: enhance,
-- awaken, imprint e equip. A M18 3/N acrescentou `summon` e `energy` — reusando o mesmo
-- mecanismo de idempotência, o que foi a decisão certa — e mexeu no TypeScript sem mexer
-- aqui.
--
-- O efeito é que, com o Postgres ligado, TODO summon e TODA compra de energia falhariam por
-- violação de constraint: os dois sumidouros da moeda premium, e portanto metade do que a
-- M18 entregou. Nada disso apareceu porque `apps/server/src/index.ts` ainda usava o
-- repositório de memória e nenhum teste do projeto tocava banco.
--
-- A prova de que não volta a derivar não está aqui: está em `tests/migrations.test.ts`, que
-- compara esta lista com `ECONOMY_ACTION_KINDS` e falha sem precisar de banco nenhum.
ALTER TABLE economy_actions DROP CONSTRAINT IF EXISTS economy_actions_kind_check;

ALTER TABLE economy_actions
  ADD CONSTRAINT economy_actions_kind_check
  CHECK (kind IN ('enhance', 'awaken', 'imprint', 'equip', 'summon', 'energy'));
