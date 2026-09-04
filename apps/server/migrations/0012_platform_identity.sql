-- §9.4 (M20) — IDENTIDADE DE PLATAFORMA no lugar do token digitado.
--
-- `players.token` era um token opaco que o jogador digitava numa caixa de texto (stub
-- declarado em M7). Ele some inteiro em vez de continuar existindo sem uso: coluna que
-- existe é coluna que uma rota volta a ler, e o critério do M20 é literal — nenhuma rota
-- aceita mais o token digitado.
--
-- O par (provider, platform_id) é a chave: o mesmo SteamID em duas contas seria a mesma
-- pessoa duas vezes, e o mesmo id vindo de plataformas diferentes é gente diferente.
--
-- `provider` é texto com CHECK, e não enum de Postgres: acrescentar um provider passa a ser
-- uma migration de uma linha em vez de um `ALTER TYPE`, e `tests/migrations.test.ts` amarra
-- esta lista à do TypeScript.
ALTER TABLE players ADD COLUMN platform_provider text;
ALTER TABLE players ADD COLUMN platform_id text;

-- Migração dos que existirem: o token vira o id de plataforma no provider de dev. Não há
-- conta de produção (nenhuma jamais existiu — ver M20), então isto serve a banco de
-- desenvolvimento e a nada mais; sem ele, um `NOT NULL` falharia com linha antiga de pé.
UPDATE players SET platform_provider = 'dev', platform_id = token WHERE platform_id IS NULL;

ALTER TABLE players ALTER COLUMN platform_provider SET NOT NULL;
ALTER TABLE players ALTER COLUMN platform_id SET NOT NULL;

ALTER TABLE players
  ADD CONSTRAINT players_platform_provider_check
  CHECK (platform_provider IN ('steam', 'epic', 'dev'));

ALTER TABLE players ADD CONSTRAINT players_platform_identity_key UNIQUE (platform_provider, platform_id);

ALTER TABLE players DROP COLUMN token;
