-- M39 1/N — A SUBIDA DE NÍVEL: usar Tomos de Experiência num herói é uma ação de economia com
-- nonce (idempotência, como toda ação que cobra recurso desde o M14 4/N), e o `CHECK` de
-- `economy_actions.kind` precisa conhecer o kind novo. `tests/migrations.test.ts` confere esta
-- lista contra `ECONOMY_ACTION_KINDS`, sem banco.
ALTER TABLE economy_actions DROP CONSTRAINT IF EXISTS economy_actions_kind_check;

ALTER TABLE economy_actions
  ADD CONSTRAINT economy_actions_kind_check
  CHECK (kind IN ('enhance', 'awaken', 'imprint', 'equip', 'summon', 'energy', 'exp'));
