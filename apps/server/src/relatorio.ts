import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { createPostgresTelemetryRepository } from './repository/postgresRepository.js';
import { gerarRelatorio } from './telemetry/relatorio.js';

// M34 3/N (D45) — `pnpm relatorio`: o relatório do playtest, lido do banco.
//
// Uma linha de leitura e uma de impressão; tudo o que é conta está em `telemetry/relatorio.ts`
// e se prova sem banco. Só LÊ — o mesmo cuidado do `restore-drill`: um relatório que escreve
// no banco de produção é um risco que não paga nada.
//
// Roda contra `DATABASE_URL`, como o `migrate`. Contra o hospedado, a variável aponta para o
// Postgres do provedor; o relatório sai no terminal e é o que se cola no registro do playtest.

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para gerar o relatório');

  const pool = new Pool({ connectionString });
  try {
    const repository = createPostgresTelemetryRepository(pool);
    const [tentativas, contas] = await Promise.all([repository.listAllAttempts(), repository.listAccounts()]);
    console.log(gerarRelatorio({ tentativas, contas, catalog: loadCatalogFromDisk(), agora: Date.now() }));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
